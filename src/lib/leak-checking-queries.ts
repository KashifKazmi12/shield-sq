import { prisma } from "./prisma";
import { eachUtcDay } from "./trend-range";

const LEAK_SEVERITIES = ["high", "medium", "low"] as const;

function emptyLeakSeverityBucket(): Record<string, number> {
  return Object.fromEntries(LEAK_SEVERITIES.map((s) => [s, 0]));
}

export async function getLeakOverviewStats(companyId: string, range: { from: Date; to: Date }) {
  const windowWhere = { createdAt: { gte: range.from, lte: range.to } };

  const [totalIdentities, activeIdentities, severityCounts, providerCounts, passwordsPwnedInWindow, openDnsFindings] =
    await Promise.all([
      prisma.monitoredIdentity.count({ where: { companyId } }),
      prisma.monitoredIdentity.count({ where: { companyId, status: "active" } }),
      prisma.leakFinding.groupBy({
        by: ["severity"],
        where: { identity: { companyId }, ...windowWhere },
        _count: { _all: true },
      }),
      prisma.leakFinding.groupBy({
        by: ["source"],
        where: { identity: { companyId }, ...windowWhere },
        _count: { _all: true },
      }),
      prisma.leakFinding.count({ where: { identity: { companyId }, passwordPwned: true, ...windowWhere } }),
      prisma.identityFinding.count({ where: { identity: { companyId }, status: "opened" } }),
    ]);

  const severityBucket = emptyLeakSeverityBucket();
  for (const row of severityCounts) severityBucket[row.severity] = row._count._all;

  const providerBucket: Record<string, number> = {};
  for (const row of providerCounts) providerBucket[row.source] = row._count._all;

  const totalFindingsInWindow = Object.values(severityBucket).reduce((a, b) => a + b, 0);

  return {
    totalIdentities,
    activeIdentities,
    totalFindingsInWindow,
    highSeverityInWindow: severityBucket.high,
    severityCounts: severityBucket,
    providerCounts: providerBucket,
    passwordsPwnedInWindow,
    openDnsFindings,
  };
}

const IDENTITY_DNS_FINDINGS_INITIAL_TAKE = 7;

export async function getOpenIdentityDnsFindings(
  companyId: string,
  filters: { limit?: number; cursor?: string } = {}
) {
  const take = filters.limit ?? IDENTITY_DNS_FINDINGS_INITIAL_TAKE;
  const rows = await prisma.identityFinding.findMany({
    where: { identity: { companyId }, status: "opened" },
    orderBy: { detectedAt: "desc" },
    take: take + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    include: { identity: { select: { identifierValue: true } } },
  });

  const hasMore = rows.length > take;
  const findings = hasMore ? rows.slice(0, take) : rows;
  return { findings, nextCursor: hasMore ? findings[findings.length - 1].id : null };
}

export async function getLeakFindingsTrend(companyId: string, range: { from: Date; to: Date }) {
  const findings = await prisma.leakFinding.findMany({
    where: { identity: { companyId }, createdAt: { gte: range.from, lte: range.to } },
    select: { createdAt: true, severity: true },
    orderBy: { createdAt: "asc" },
  });

  const byDay = new Map<string, Record<string, number>>();
  for (const day of eachUtcDay(range.from, range.to)) {
    byDay.set(day, emptyLeakSeverityBucket());
  }
  for (const f of findings) {
    const day = f.createdAt.toISOString().slice(0, 10);
    const bucket = byDay.get(day) ?? emptyLeakSeverityBucket();
    bucket[f.severity] = (bucket[f.severity] ?? 0) + 1;
    byDay.set(day, bucket);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));
}

const RECENT_LEAK_FINDINGS_INITIAL_TAKE = 7;

export async function getRecentLeakFindings(
  companyId: string,
  filters: { severity?: string; source?: string; from: Date; to: Date; limit?: number; cursor?: string }
) {
  const where = {
    identity: { companyId },
    createdAt: { gte: filters.from, lte: filters.to },
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.source ? { source: filters.source } : {}),
  };
  const take = filters.limit ?? RECENT_LEAK_FINDINGS_INITIAL_TAKE;

  const rows = await prisma.leakFinding.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    include: { identity: { select: { identifierValue: true, identifierType: true } } },
  });

  const hasMore = rows.length > take;
  const findings = hasMore ? rows.slice(0, take) : rows;
  return { findings, nextCursor: hasMore ? findings[findings.length - 1].id : null };
}
