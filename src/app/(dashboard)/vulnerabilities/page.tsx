import { requireCompanySession } from "@/lib/session";
import { resolveProject } from "@/lib/current-project";
import { listTrivyFindings, getTopOffendingImages } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { SEVERITIES, DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { DataTable } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { TextFilter } from "@/components/TextFilter";
import { Pagination } from "@/components/Pagination";
import { TrivyFindingsTable } from "@/components/TrivyFindingsTable";

export default async function TrivyPage({
  searchParams,
}: {
  // Next 16: page-level searchParams is a Promise (Async Request APIs).
  searchParams: Promise<{
    project?: string;
    severity?: string;
    repo?: string;
    fixedStatus?: "fixed" | "unfixed";
    resource?: string;
    cursor?: string;
  }>;
}) {
  const { companyId } = await requireCompanySession();
  const { project: projectParam, severity, repo, fixedStatus, resource, cursor } = await searchParams;
  const project = await resolveProject(companyId, projectParam);
  if (!project) {
    return <p className="muted">No project configured yet.</p>;
  }

  const [{ findings, nextCursor, total }, topImages, repoRows] = await Promise.all([
    listTrivyFindings(project.id, {
      severity,
      repo,
      fixedStatus,
      resource,
      cursor,
    }),
    getTopOffendingImages(project.id),
    prisma.scan.findMany({
      where: { projectId: project.id, source: "trivy", repo: { not: null } },
      select: { repo: true },
      distinct: ["repo"],
    }),
  ]);

  return (
    <div>
      <h2 className="page-title">Vulnerabilities — {project.name}</h2>

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
            { name: "severity", label: "Severity", options: SEVERITIES.map((s) => ({ value: s, label: s })) },
            { name: "repo", label: "Repo", options: repoRows.filter((r) => r.repo).map((r) => ({ value: r.repo as string, label: r.repo as string })) },
            { name: "fixedStatus", label: "Fix status", options: [{ value: "fixed", label: "Fixed" }, { value: "unfixed", label: "Unfixed" }] },
          ]}
        />
        <TextFilter name="resource" placeholder="Filter by image / target" />
      </div>

      <TrivyFindingsTable findings={findings} />
      <Pagination nextCursor={nextCursor} pageCount={findings.length} total={total} take={DEFAULT_PAGE_SIZE} />
    </div>
  );
}
