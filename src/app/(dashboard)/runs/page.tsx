import Link from "next/link";
import { requireCompanySession } from "@/lib/session";
import { resolveProject } from "@/lib/current-project";
import { listPipelineRuns } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { FilterBar } from "@/components/FilterBar";
import { Pagination } from "@/components/Pagination";
import { StatusBadge } from "@/components/SeverityBadge";

export default async function RunsPage({
  searchParams,
}: {
  // Next 16: page-level searchParams is a Promise (Async Request APIs).
  searchParams: Promise<{ project?: string; status?: string; repo?: string; cursor?: string }>;
}) {
  const { companyId } = await requireCompanySession();
  const { project: projectParam, status, repo, cursor } = await searchParams;
  const project = await resolveProject(companyId, projectParam);
  if (!project) {
    return <p className="muted">No project configured yet.</p>;
  }

  const [{ runs, nextCursor, total }, repoRows] = await Promise.all([
    listPipelineRuns(project.id, {
      status,
      repo,
      cursor,
    }),
    prisma.scan.findMany({
      where: { projectId: project.id, source: "trivy", repo: { not: null } },
      select: { repo: true },
      distinct: ["repo"],
    }),
  ]);

  return (
    <div>
      <h2 className="page-title">Pipeline Runs — {project.name}</h2>

      <div className="toolbar">
        <FilterBar
          fields={[
            {
              name: "status",
              label: "Status",
              options: [
                { value: "success", label: "success" },
                { value: "warning", label: "warning" },
                { value: "failed", label: "failed" },
              ],
            },
            {
              name: "repo",
              label: "Repo",
              options: repoRows.filter((r) => r.repo).map((r) => ({ value: r.repo as string, label: r.repo as string })),
            },
          ]}
        />
      </div>

      <table>
        <thead>
          <tr>
            <th>Repo</th>
            <th>Branch</th>
            <th>Commit</th>
            <th>Pipeline</th>
            <th>Status</th>
            <th>Findings</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td><Link href={`/runs/${run.id}`}>{run.repo ?? run.id}</Link></td>
              <td>{run.branch ?? "—"}</td>
              <td>{run.commitSha?.slice(0, 7) ?? "—"}</td>
              <td>{run.pipelineId ?? "—"}</td>
              <td><StatusBadge status={run.status} /></td>
              <td>{run._count.findings}</td>
              <td>{run.createdAt.toLocaleString()}</td>
            </tr>
          ))}
          {runs.length === 0 && (
            <tr><td colSpan={7} className="muted">No pipeline runs match these filters.</td></tr>
          )}
        </tbody>
      </table>
      <Pagination nextCursor={nextCursor} pageCount={runs.length} total={total} take={DEFAULT_PAGE_SIZE} />
    </div>
  );
}
