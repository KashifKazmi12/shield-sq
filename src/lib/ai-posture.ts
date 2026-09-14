import { prisma } from "./prisma";

// A bounded, company-scoped summary for Chat with Your Security Data — not
// a full data dump (no embeddings/RAG needed at this scale, see
// FUTURE-FEATURES.md's effort sizing). Caps each list so the prompt stays
// small regardless of how much data a company has accumulated.
const TOP_ITEMS_LIMIT = 8;

export async function getCompanyPostureSummary(companyId: string): Promise<string> {
  const [
    findingSeverityCounts,
    topOpenFindings,
    leakFindingCount,
    openIdentityDnsCount,
    openSiteFindingCount,
    monitoredSiteCount,
    monitoredIdentityCount,
  ] = await Promise.all([
    prisma.finding.groupBy({
      by: ["severity"],
      where: { project: { companyId }, status: { in: ["opened", "reopened"] } },
      _count: { _all: true },
    }),
    prisma.finding.findMany({
      where: { project: { companyId }, status: { in: ["opened", "reopened"] }, severity: { in: ["critical", "high"] } },
      orderBy: { detectedAt: "desc" },
      take: TOP_ITEMS_LIMIT,
      select: { tool: true, title: true, severity: true, resource: true },
    }),
    prisma.leakFinding.count({ where: { identity: { companyId } } }),
    prisma.identityFinding.count({ where: { identity: { companyId }, status: "opened" } }),
    prisma.siteFinding.count({ where: { site: { companyId }, status: { in: ["opened", "reopened"] } } }),
    prisma.monitoredSite.count({ where: { companyId } }),
    prisma.monitoredIdentity.count({ where: { companyId } }),
  ]);

  const severityLine = findingSeverityCounts.map((r) => `${r.severity}: ${r._count._all}`).join(", ") || "none";
  const topFindingsLines = topOpenFindings.length
    ? topOpenFindings.map((f) => `- [${f.tool}/${f.severity}] ${f.title}${f.resource ? ` (${f.resource})` : ""}`).join("\n")
    : "- none";

  return [
    `Open codebase/deployment findings by severity: ${severityLine}`,
    `Top open critical/high findings:\n${topFindingsLines}`,
    `Leak Checking: ${monitoredIdentityCount} identities monitored, ${leakFindingCount} breach findings total, ${openIdentityDnsCount} open SPF/DMARC/DKIM gaps.`,
    `URL Monitoring: ${monitoredSiteCount} sites monitored, ${openSiteFindingCount} open SSL/CAA/subdomain findings.`,
  ].join("\n\n");
}
