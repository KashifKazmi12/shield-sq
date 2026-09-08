import { requireCompanySession } from "@/lib/session";
import { resolveProject } from "@/lib/current-project";
import { listFalcoFindings } from "@/lib/queries";
import { resolveAlertWindow } from "@/lib/alert-window";
import { prisma } from "@/lib/prisma";
import { SEVERITIES, DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { FilterBar } from "@/components/FilterBar";
import { TextFilter } from "@/components/TextFilter";
import { Pagination } from "@/components/Pagination";
import { FalcoFeed } from "@/components/FalcoFeed";
import { LiveRefreshToggle } from "@/components/LiveRefreshToggle";
import { DashboardTimePicker } from "@/components/DashboardTimePicker";

export default async function RuntimeAlertsFeedPage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string;
    severity?: string;
    ruleName?: string;
    resource?: string;
    window?: string;
    from?: string;
    to?: string;
    cursor?: string;
  }>;
}) {
  const { companyId } = await requireCompanySession();
  const { project: projectParam, severity, ruleName, resource, window: windowParam, from, to, cursor } =
    await searchParams;
  const project = await resolveProject(companyId, projectParam);
  if (!project) {
    return <p className="muted">No project configured yet.</p>;
  }

  const alertWindow = resolveAlertWindow({ window: windowParam, from, to });
  const useUpperBound = alertWindow.key === "custom";

  const [{ findings, nextCursor, total }, ruleRows] = await Promise.all([
    listFalcoFindings(project.id, {
      severity,
      ruleName,
      resource,
      detectedAfter: alertWindow.from ?? undefined,
      detectedBefore: useUpperBound ? alertWindow.to : undefined,
      cursor,
    }),
    prisma.finding.findMany({
      where: { scan: { projectId: project.id }, tool: "falco", ruleName: { not: null } },
      select: { ruleName: true },
      distinct: ["ruleName"],
    }),
  ]);

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h2 className="page-title" style={{ margin: 0 }}>
          Alerts — {project.name}
        </h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <DashboardTimePicker />
          <LiveRefreshToggle />
        </div>
      </div>

      <div className="toolbar">
        <FilterBar
          fields={[
            { name: "severity", label: "Severity", options: SEVERITIES.map((s) => ({ value: s, label: s })) },
            {
              name: "ruleName",
              label: "Rule",
              options: ruleRows
                .filter((r) => r.ruleName)
                .map((r) => ({ value: r.ruleName as string, label: r.ruleName as string })),
            },
          ]}
        />
        <TextFilter name="resource" placeholder="Filter by host / pod / namespace" />
      </div>

      <FalcoFeed findings={findings} />
      <Pagination nextCursor={nextCursor} pageCount={findings.length} total={total} take={DEFAULT_PAGE_SIZE} />
    </div>
  );
}
