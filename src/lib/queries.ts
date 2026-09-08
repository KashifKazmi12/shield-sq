import { prisma } from "./prisma";
import { SEVERITIES, DEFAULT_PAGE_SIZE } from "./constants";
import { severityRank } from "./severity";
import { eachUtcDay, emptySeverityBucket } from "./trend-range";
import { buildOpenInventoryTrend } from "./finding-lifecycle";

export async function listProjects(companyId: string) {
  return prisma.project.findMany({ where: { companyId }, orderBy: { name: "asc" } });
}

export async function getSeverityCounts(
  projectId: string,
  tool?: "trivy" | "falco",
  options?: { detectedAfter?: Date; detectedBefore?: Date; openOnly?: boolean }
) {
  const counts = await prisma.finding.groupBy({
    by: ["severity"],
    where: {
      projectId,
      ...(tool ? { tool } : {}),
      ...(options?.detectedAfter || options?.detectedBefore
        ? {
            detectedAt: {
              ...(options.detectedAfter ? { gte: options.detectedAfter } : {}),
              ...(options.detectedBefore ? { lte: options.detectedBefore } : {}),
            },
          }
        : {}),
      // Trivy lifecycle: openOnly = current risk (exclude resolved).
      ...(options?.openOnly && tool === "trivy"
        ? { status: { in: ["opened", "reopened"] } }
        : {}),
    },
    _count: { _all: true },
  });

  const result: Record<string, number> = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const row of counts) {
    result[row.severity] = row._count._all;
  }
  return result;
}

export async function getOverviewStats(
  projectId: string,
  tool?: "trivy" | "falco",
  options?: { detectedAfter?: Date; detectedBefore?: Date }
) {
  const findingWhere = {
    projectId,
    ...(tool ? { tool } : {}),
    ...(options?.detectedAfter || options?.detectedBefore
      ? {
          detectedAt: {
            ...(options.detectedAfter ? { gte: options.detectedAfter } : {}),
            ...(options.detectedBefore ? { lte: options.detectedBefore } : {}),
          },
        }
      : {}),
  };
  const scanWhere = {
    projectId,
    ...(tool ? { source: tool } : {}),
    ...(options?.detectedAfter || options?.detectedBefore
      ? {
          createdAt: {
            ...(options.detectedAfter ? { gte: options.detectedAfter } : {}),
            ...(options.detectedBefore ? { lte: options.detectedBefore } : {}),
          },
        }
      : {}),
  };
  const [severityCounts, healthSeverityCounts, totalFindings, openCritical, openFindings, resolvedFindings, totalScans] =
    await Promise.all([
      getSeverityCounts(projectId, tool, options),
      // Health reflects current open risk for Trivy (resolved no longer hurts the score).
      tool === "trivy"
        ? getSeverityCounts(projectId, "trivy", { ...options, openOnly: true })
        : Promise.resolve(null),
      prisma.finding.count({ where: findingWhere }),
      prisma.finding.count({
        where: {
          ...findingWhere,
          severity: "critical",
          ...(tool === "trivy" ? { status: { in: ["opened", "reopened"] } } : {}),
        },
      }),
      prisma.finding.count({
        where: {
          ...findingWhere,
          ...(tool === "trivy" ? { status: { in: ["opened", "reopened"] } } : {}),
        },
      }),
      tool === "trivy"
        ? prisma.finding.count({ where: { ...findingWhere, status: "resolved" } })
        : Promise.resolve(0),
      prisma.scan.count({ where: scanWhere }),
    ]);

  const healthScore = computeHealthScore(healthSeverityCounts ?? severityCounts);

  return {
    severityCounts,
    totalFindings,
    openCritical,
    openFindings: tool === "trivy" ? openFindings : totalFindings,
    resolvedFindings,
    totalScans,
    healthScore,
  };
}

export async function getRecentScans(
  projectId: string,
  filters: {
    source?: "trivy" | "falco";
    status?: string;
    createdAfter?: Date;
    createdBefore?: Date;
  },
  limit = 10
) {
  return prisma.scan.findMany({
    where: {
      projectId,
      ...(filters.source ? { source: filters.source } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.createdAfter || filters.createdBefore
        ? {
            createdAt: {
              ...(filters.createdAfter ? { gte: filters.createdAfter } : {}),
              ...(filters.createdBefore ? { lte: filters.createdBefore } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { _count: { select: { observations: true } } },
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

export async function getFindingsTrend(
  projectId: string,
  options: { from: Date; to: Date; tool?: "trivy" | "falco" }
) {
  const { from, to, tool } = options;
  const findings = await prisma.finding.findMany({
    where: {
      projectId,
      detectedAt: { gte: from, lte: to },
      ...(tool ? { tool } : {}),
    },
    select: { detectedAt: true, severity: true },
    orderBy: { detectedAt: "asc" },
  });

  const byDay = new Map<string, Record<string, number>>();
  for (const day of eachUtcDay(from, to)) {
    byDay.set(day, emptySeverityBucket());
  }
  for (const f of findings) {
    const day = f.detectedAt.toISOString().slice(0, 10);
    const bucket = byDay.get(day) ?? emptySeverityBucket();
    bucket[f.severity] = (bucket[f.severity] ?? 0) + 1;
    byDay.set(day, bucket);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));
}

/**
 * Trivy open-inventory trend: each finding counts on every day it was open
 * (openIntervals), so the line stays high until resolve and rises again on reopen.
 */
export async function getTrivyOpenTrend(
  projectId: string,
  options: { from: Date; to: Date }
) {
  const { from, to } = options;
  const findings = await prisma.finding.findMany({
    where: {
      projectId,
      tool: "trivy",
      // Anything first-seen after the window can't contribute to open days in range.
      detectedAt: { lte: to },
    },
    select: { severity: true, openIntervals: true },
  });

  return buildOpenInventoryTrend(findings, from, to);
}

export async function getMeanTimeToFix(projectId: string) {
  // Approximated as the gap between first observation of a finding key and
  // the next Trivy scan that no longer observes that key. Coarse proxy; see GAPS.md.
  const scans = await prisma.scan.findMany({
    where: { projectId, source: "trivy" },
    orderBy: { createdAt: "asc" },
    include: {
      observations: {
        include: {
          finding: { select: { title: true, resource: true, detectedAt: true } },
        },
      },
    },
  });

  if (scans.length < 2) return null;

  const seen = new Map<string, Date>();
  const resolutionTimesMs: number[] = [];

  for (const scan of scans) {
    const currentKeys = new Set(
      scan.observations.map((o) => `${o.finding.title}::${o.finding.resource}`)
    );
    for (const [key, firstSeen] of seen) {
      if (!currentKeys.has(key)) {
        resolutionTimesMs.push(scan.createdAt.getTime() - firstSeen.getTime());
        seen.delete(key);
      }
    }
    for (const o of scan.observations) {
      const key = `${o.finding.title}::${o.finding.resource}`;
      if (!seen.has(key)) seen.set(key, o.finding.detectedAt);
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
  /** Finding lifecycle status. Default for Trivy: open only (opened + reopened). */
  status?: "opened" | "reopened" | "resolved" | "open" | "all";
  /** Only findings with detectedAt >= this instant (alert time windows). */
  detectedAfter?: Date;
  /** Only findings with detectedAt <= this instant (custom ranges). */
  detectedBefore?: Date;
  cursor?: string;
  take?: number;
};

export async function listTrivyFindings(projectId: string, filters: FindingFilters) {
  const take = filters.take ?? DEFAULT_PAGE_SIZE;
  const statusFilter =
    filters.status === "all"
      ? {}
      : filters.status === "open" || !filters.status
        ? { status: { in: ["opened", "reopened"] } }
        : { status: filters.status };
  const where = {
    tool: "trivy" as const,
    projectId,
    ...statusFilter,
    ...(filters.repo
      ? { observations: { some: { scan: { repo: filters.repo } } } }
      : {}),
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
    projectId,
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.ruleName ? { ruleName: filters.ruleName } : {}),
    ...(filters.resource ? { resource: { contains: filters.resource, mode: "insensitive" as const } } : {}),
    ...(filters.detectedAfter || filters.detectedBefore
      ? {
          detectedAt: {
            ...(filters.detectedAfter ? { gte: filters.detectedAfter } : {}),
            ...(filters.detectedBefore ? { lte: filters.detectedBefore } : {}),
          },
        }
      : {}),
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
    where: {
      projectId,
      tool: "trivy",
      resource: { not: null },
      status: { in: ["opened", "reopened"] },
    },
    _count: { _all: true },
    orderBy: { _count: { resource: "desc" } },
    take: limit,
  });
  return grouped.map((g) => ({ resource: g.resource, count: g._count._all }));
}

/** Open Trivy findings, severity-first (critical → high → medium → low), then newest. */
export async function getTopVulnerabilities(
  projectId: string,
  limit = 5,
  options?: { detectedAfter?: Date; detectedBefore?: Date }
) {
  const findings = await prisma.finding.findMany({
    where: {
      projectId,
      tool: "trivy",
      status: { in: ["opened", "reopened"] },
      severity: { in: ["critical", "high", "medium", "low"] },
      ...(options?.detectedAfter || options?.detectedBefore
        ? {
            detectedAt: {
              ...(options.detectedAfter ? { gte: options.detectedAfter } : {}),
              ...(options.detectedBefore ? { lte: options.detectedBefore } : {}),
            },
          }
        : {}),
    },
    orderBy: { detectedAt: "desc" },
    include: {
      scan: { select: { repo: true } },
    },
  });

  findings.sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return b.detectedAt.getTime() - a.detectedAt.getTime();
  });

  return findings.slice(0, limit);
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
      include: { _count: { select: { observations: true } } },
    }),
    prisma.scan.count({ where }),
  ]);

  const hasMore = runs.length > take;
  const page = hasMore ? runs.slice(0, take) : runs;
  return { runs: page, nextCursor: hasMore ? page[page.length - 1].id : null, total };
}

export async function getScan(scanId: string) {
  return prisma.scan.findUnique({
    where: { id: scanId },
    include: {
      project: true,
      _count: { select: { observations: true } },
    },
  });
}

export async function listScanFindings(
  scanId: string,
  filters: { cursor?: string; take?: number } = {}
) {
  const take = filters.take ?? DEFAULT_PAGE_SIZE;
  const where = { scanId };

  const [observations, total] = await Promise.all([
    prisma.scanFinding.findMany({
      where,
      take: take + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      orderBy: { observedAt: "desc" },
      include: { finding: true },
    }),
    prisma.scanFinding.count({ where }),
  ]);

  const hasMore = observations.length > take;
  const page = hasMore ? observations.slice(0, take) : observations;
  return {
    findings: page.map((o) => o.finding),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    total,
  };
}
