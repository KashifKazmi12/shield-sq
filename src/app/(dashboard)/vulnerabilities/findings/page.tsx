import { requireCompanySession } from "@/lib/session";
import { resolveProject } from "@/lib/current-project";
import { listTrivyFindings, getTopOffendingImages } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { isAiAssistantAvailable } from "@/lib/ai-runtime";
import { SEVERITIES, DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { LIFECYCLE_TRACKED_TOOLS } from "@/lib/finding-lifecycle";
import { DataTable } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { TextFilter } from "@/components/TextFilter";
import { Pagination } from "@/components/Pagination";
import { TrivyFindingsTable } from "@/components/TrivyFindingsTable";
import { PrioritizeButton } from "./PrioritizeButton";

export default async function VulnerabilityFindingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string;
    severity?: string;
    repo?: string;
    fixedStatus?: "fixed" | "unfixed";
    resource?: string;
    status?: "opened" | "reopened" | "resolved" | "open" | "all";
    tool?: string;
    sort?: "priority";
    cursor?: string;
  }>;
}) {
  const { companyId } = await requireCompanySession();
  const { project: projectParam, severity, repo, fixedStatus, resource, status, tool, sort, cursor } = await searchParams;
  const project = await resolveProject(companyId, projectParam);
  if (!project) {
    return <p className="muted">No project configured yet.</p>;
  }

  const [{ findings, nextCursor, total }, topImages, repoRows, aiAvailable] = await Promise.all([
    listTrivyFindings(project.id, {
      severity,
      repo,
      fixedStatus,
      resource,
      status,
      tool,
      sort,
      cursor,
    }),
    getTopOffendingImages(project.id),
    prisma.scan.findMany({
      where: { projectId: project.id, source: "trivy", repo: { not: null } },
      select: { repo: true },
      distinct: ["repo"],
    }),
    isAiAssistantAvailable(companyId),
  ]);

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="page-title" style={{ margin: 0 }}>Findings — {project.name}</h2>
        {aiAvailable && <PrioritizeButton projectId={project.id} />}
      </div>

      <div className="section card">
        <h3>Top offending images</h3>
        <DataTable
          columns={[
            { id: "image", header: "Image / target", mobileFullWidth: true },
            { id: "count", header: "Findings" },
          ]}
          rows={topImages.map((row) => ({
            key: row.resource ?? "unknown",
            cells: [row.resource, row.count],
          }))}
          emptyMessage="No data yet."
        />
      </div>

      <div className="toolbar">
        <FilterBar
          fields={[
            {
              name: "tool",
              label: "Scanner",
              options: LIFECYCLE_TRACKED_TOOLS.map((t) => ({ value: t, label: t })),
            },
            {
              name: "status",
              label: "Status",
              defaultValue: "open",
              hideAllOption: true,
              options: [
                { value: "open", label: "Status: Open" },
                { value: "resolved", label: "Status: Resolved" },
                { value: "all", label: "Status: All" },
              ],
            },
            { name: "severity", label: "Severity", options: SEVERITIES.map((s) => ({ value: s, label: s })) },
            {
              name: "repo",
              label: "Repo",
              options: repoRows
                .filter((r) => r.repo)
                .map((r) => ({ value: r.repo as string, label: r.repo as string })),
            },
            {
              name: "fixedStatus",
              label: "Fix status",
              options: [
                { value: "fixed", label: "Fixed" },
                { value: "unfixed", label: "Unfixed" },
              ],
            },
            ...(aiAvailable
              ? [{ name: "sort", label: "Sort", options: [{ value: "priority", label: "AI priority" }] }]
              : []),
          ]}
        />
        <TextFilter name="resource" placeholder="Filter by image / target" />
      </div>

      <TrivyFindingsTable findings={findings} aiAvailable={aiAvailable} />
      <Pagination nextCursor={nextCursor} pageCount={findings.length} total={total} take={DEFAULT_PAGE_SIZE} />
    </div>
  );
}
