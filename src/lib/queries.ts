import { prisma } from "./prisma";
import { SEVERITIES, DEFAULT_PAGE_SIZE } from "./constants";

export async function listProjects(companyId: string) {
  return prisma.project.findMany({ where: { companyId }, orderBy: { name: "asc" } });
}

export async function getSeverityCounts(projectId: string, tool?: "trivy" | "falco") {
  const counts = await prisma.finding.groupBy({
    by: ["severity"],
    where: {
      scan: { projectId },
      ...(tool ? { tool } : {}),
    },
    _count: { _all: true },
  });

  const result: Record<string, number> = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const row of counts) {
    result[row.severity] = row._count._all;
  }
  return result;
}

export async function getOverviewStats(projectId: string) {
  const [severityCounts, totalFindings, openCritical, totalScans] = await Promise.all([
    getSeverityCounts(projectId),
    prisma.finding.count({ where: { scan: { projectId } } }),
    prisma.finding.count({ where: { scan: { projectId }, severity: "critical" } }),
    prisma.scan.count({ where: { projectId } }),
  ]);

  const healthScore = computeHealthScore(severityCounts);

  return { severityCounts, totalFindings, openCritical, totalScans, healthScore };
}

export async function getRecentScans(
  projectId: string,
  filters: { source?: "trivy" | "falco"; status?: string },
  limit = 10
) {
  return prisma.scan.findMany({
    where: {
      projectId,
      ...(filters.source ? { source: filters.source } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { _count: { select: { findings: true } } },
  });
}

// Weighted deduction from 100: critical/high hurt most. Floor at 0.
function computeHealthScore(counts: Record<string, number>) {
  const weights: Record<string, number> = { critical: 10, high: 4, medium: 1, low: 0.25, info: 0 };
  const deduction = Object.entries(counts).reduce(
    (sum, [severity, count]) => sum + (weights[severity] ?? 0) * count,
    0
  );
  return Math.max(0, Math.round(100 - deduction));
}

export async function getFindingsTrend(projectId: string, days: number, tool?: "trivy" | "falco") {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const findings = await prisma.finding.findMany({
    where: {
      scan: { projectId },
      detectedAt: { gte: since },
      ...(tool ? { tool } : {}),
    },
    select: { detectedAt: true, severity: true },
    orderBy: { detectedAt: "asc" },
  });

  const byDay = new Map<string, Record<string, number>>();
  for (const f of findings) {
    const day = f.detectedAt.toISOString().slice(0, 10);
    const bucket = byDay.get(day) ?? Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
    bucket[f.severity] = (bucket[f.severity] ?? 0) + 1;
    byDay.set(day, bucket);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));
}

export async function getMeanTimeToFix(projectId: string) {
  // "Fixed" isn't tracked as a distinct state in the current schema — a
  // finding is treated as resolved when it stops appearing in the *latest*
  // scan for its resource. Approximated here as the gap between a finding's
  // detectedAt and the next scan of the same source that no longer contains
  // an open finding with the same title+resource. This is a coarse proxy,
  // not an exact MTTR; see GAPS.md.
  const scans = await prisma.scan.findMany({
    where: { projectId, source: "trivy" },
    orderBy: { createdAt: "asc" },
    include: { findings: true },
  });

  if (scans.length < 2) return null;

  const seen = new Map<string, Date>();
  const resolutionTimesMs: number[] = [];

  for (const scan of scans) {
    const currentKeys = new Set(scan.findings.map((f) => `${f.title}::${f.resource}`));
    for (const [key, firstSeen] of seen) {
      if (!currentKeys.has(key)) {
        resolutionTimesMs.push(scan.createdAt.getTime() - firstSeen.getTime());
        seen.delete(key);
      }
    }
    for (const f of scan.findings) {
      const key = `${f.title}::${f.resource}`;
      if (!seen.has(key)) seen.set(key, f.detectedAt);
    }
  }

  if (resolutionTimesMs.length === 0) return null;
  const avgMs = resolutionTimesMs.reduce((a, b) => a + b, 0) / resolutionTimesMs.length;
  return avgMs / (1000 * 60 * 60 * 24); // days
}

export type FindingFilters = {
  severity?: string;
  repo?: string;
  fixedStatus?: "fixed" | "unfixed";
  ruleName?: string;
  resource?: string;
  cursor?: string;
  take?: number;
};

export async function listTrivyFindings(projectId: string, filters: FindingFilters) {
  const take = filters.take ?? DEFAULT_PAGE_SIZE;
  const where = {
    tool: "trivy" as const,
    scan: {
      projectId,
      ...(filters.repo ? { repo: filters.repo } : {}),
    },
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.fixedStatus === "fixed" ? { fixedVersion: { not: null } } : {}),
    ...(filters.fixedStatus === "unfixed" ? { fixedVersion: null } : {}),
    ...(filters.resource ? { resource: { contains: filters.resource, mode: "insensitive" as const } } : {}),
  };

  const [findings, total] = await Promise.all([
    prisma.finding.findMany({
      where,
      take: take + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      orderBy: { detectedAt: "desc" },
      include: { scan: { select: { repo: true, branch: true, commitSha: true, pipelineId: true, createdAt: true } } },
    }),
    prisma.finding.count({ where }),
  ]);

  const hasMore = findings.length > take;
  const page = hasMore ? findings.slice(0, take) : findings;
  return { findings: page, nextCursor: hasMore ? page[page.length - 1].id : null, total };
}

export async function listFalcoFindings(projectId: string, filters: FindingFilters) {
  const take = filters.take ?? DEFAULT_PAGE_SIZE;
  const where = {
    tool: "falco" as const,
    scan: { projectId },
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.ruleName ? { ruleName: filters.ruleName } : {}),
    ...(filters.resource ? { resource: { contains: filters.resource, mode: "insensitive" as const } } : {}),
  };

  const [findings, total] = await Promise.all([
    prisma.finding.findMany({
      where,
      take: take + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      orderBy: { detectedAt: "desc" },
      include: { scan: { select: { createdAt: true } } },
    }),
    prisma.finding.count({ where }),
  ]);

  const hasMore = findings.length > take;
  const page = hasMore ? findings.slice(0, take) : findings;
  return { findings: page, nextCursor: hasMore ? page[page.length - 1].id : null, total };
}

export async function getTopOffendingImages(projectId: string, limit = 5) {
  const grouped = await prisma.finding.groupBy({
    by: ["resource"],
    where: { scan: { projectId }, tool: "trivy", resource: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { resource: "desc" } },
    take: limit,
  });
  return grouped.map((g) => ({ resource: g.resource, count: g._count._all }));
}

export type PipelineRunFilters = {
  status?: string;
  repo?: string;
  cursor?: string;
  take?: number;
};

export async function listPipelineRuns(projectId: string, filters: PipelineRunFilters) {
  const take = filters.take ?? DEFAULT_PAGE_SIZE;
  const where = {
    projectId,
    source: "trivy" as const,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.repo ? { repo: filters.repo } : {}),
  };

  const [runs, total] = await Promise.all([
    prisma.scan.findMany({
      where,
      take: take + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { findings: true } } },
    }),
    prisma.scan.count({ where }),
  ]);

  const hasMore = runs.length > take;
  const page = hasMore ? runs.slice(0, take) : runs;
  return { runs: page, nextCursor: hasMore ? page[page.length - 1].id : null, total };
}

export async function getScanWithFindings(scanId: string) {
  return prisma.scan.findUnique({
    where: { id: scanId },
    include: { findings: { orderBy: { severity: "asc" } }, project: true },
  });
}
