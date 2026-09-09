import { prisma } from "./prisma";
import { DEFAULT_PAGE_SIZE } from "./constants";
import { eachUtcDay } from "./trend-range";

export type StatusBucket = "2xx" | "3xx" | "4xx" | "5xx" | "unreachable";

export function statusBucket(code: number | null): StatusBucket {
  if (code == null || code < 200) return "unreachable";
  if (code < 300) return "2xx";
  if (code < 400) return "3xx";
  if (code < 500) return "4xx";
  return "5xx";
}

function emptyStatusBucket(): Record<StatusBucket, number> {
  return { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, unreachable: 0 };
}

// Latest root scan (endpointId: null) per site — a snapshot of "is this site
// up right now", independent of the selected time window.
async function getLatestRootScanPerSite(companyId: string) {
  const sites = await prisma.monitoredSite.findMany({
    where: { companyId },
    select: {
      id: true,
      scans: {
        where: { endpointId: null },
        orderBy: { scannedAt: "desc" },
        take: 1,
        select: { statusCode: true },
      },
    },
  });
  return sites.map((s) => s.scans[0]?.statusCode ?? null);
}

export async function getSiteOverviewStats(companyId: string, range: { from: Date; to: Date }) {
  const [totalSites, totalEndpoints, latestStatusCodes, latencyAgg] = await Promise.all([
    prisma.monitoredSite.count({ where: { companyId } }),
    prisma.monitoredEndpoint.count({ where: { site: { companyId } } }),
    getLatestRootScanPerSite(companyId),
    prisma.siteScanResult.aggregate({
      where: { site: { companyId }, scannedAt: { gte: range.from, lte: range.to } },
      _avg: { latencyMs: true },
    }),
  ]);

  const sitesDown = latestStatusCodes.filter((code) => statusBucket(code) !== "2xx" && statusBucket(code) !== "3xx").length;

  return {
    totalSites,
    totalEndpoints,
    sitesDown,
    avgLatencyMs: latencyAgg._avg.latencyMs,
  };
}

export async function getStatusBreakdown(companyId: string) {
  const latestStatusCodes = await getLatestRootScanPerSite(companyId);
  const bucket = emptyStatusBucket();
  for (const code of latestStatusCodes) bucket[statusBucket(code)] += 1;
  return bucket;
}

export async function getLatencyTrend(companyId: string, range: { from: Date; to: Date }) {
  const scans = await prisma.siteScanResult.findMany({
    where: { site: { companyId }, scannedAt: { gte: range.from, lte: range.to } },
    select: { scannedAt: true, latencyMs: true },
    orderBy: { scannedAt: "asc" },
  });

  const byDay = new Map<string, { total: number; count: number }>();
  for (const day of eachUtcDay(range.from, range.to)) {
    byDay.set(day, { total: 0, count: 0 });
  }
  for (const scan of scans) {
    if (scan.latencyMs == null) continue;
    const day = scan.scannedAt.toISOString().slice(0, 10);
    const bucket = byDay.get(day) ?? { total: 0, count: 0 };
    bucket.total += scan.latencyMs;
    bucket.count += 1;
    byDay.set(day, bucket);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { total, count }]) => ({ date, avgLatencyMs: count > 0 ? total / count : null }));
}

export async function getRecentSiteScans(
  companyId: string,
  filters: { status?: "up" | "down"; from: Date; to: Date; limit?: number }
) {
  const upFilter = { statusCode: { gte: 200, lt: 400 } };
  const downFilter = { OR: [{ statusCode: null }, { statusCode: { lt: 200 } }, { statusCode: { gte: 400 } }] };

  return prisma.siteScanResult.findMany({
    where: {
      site: { companyId },
      scannedAt: { gte: filters.from, lte: filters.to },
      ...(filters.status === "up" ? upFilter : {}),
      ...(filters.status === "down" ? downFilter : {}),
    },
    orderBy: { scannedAt: "desc" },
    take: filters.limit ?? DEFAULT_PAGE_SIZE,
    include: { site: { select: { domain: true } }, endpoint: { select: { path: true } } },
  });
}
