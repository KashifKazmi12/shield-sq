import { notFound, redirect } from "next/navigation";
import { requireCompanySession } from "@/lib/session";
import { getScan, listScanFindings } from "@/lib/queries";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { DataTable } from "@/components/DataTable";
import { Pagination } from "@/components/Pagination";
import { SeverityBadge, StatusBadge, FindingStatusBadge } from "@/components/SeverityBadge";
import { formatFindingLifetime } from "@/lib/finding-lifecycle";

export default async function RunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ project?: string; cursor?: string }>;
}) {
  const { companyId } = await requireCompanySession();
  const { id } = await params;
  const { project: projectParam, cursor } = await searchParams;
  const scan = await getScan(id);

  if (!scan || scan.project.companyId !== companyId) notFound();

  if (scan.source === "falco") {
    const qs = new URLSearchParams();
    qs.set("project", projectParam || scan.projectId);
    if (cursor) qs.set("cursor", cursor);
    redirect(`/runtime-alerts/buckets/${scan.id}?${qs.toString()}`);
  }

  const { findings, nextCursor, total } = await listScanFindings(id, { cursor });
  const now = new Date();

  return (
    <div>
      <h2 className="page-title">{scan.repo ?? scan.id}</h2>

      <div className="card section">
        <dl>
          <dt className="muted">Status</dt>
          <dd>
            <StatusBadge status={scan.status} />
          </dd>
          <dt className="muted">Branch</dt>
          <dd>{scan.branch ?? "—"}</dd>
          <dt className="muted">Commit</dt>
          <dd>{scan.commitSha ?? "—"}</dd>
          <dt className="muted">Pipeline</dt>
          <dd>{scan.pipelineId ?? "—"}</dd>
          <dt className="muted">Ran at</dt>
          <dd>{scan.createdAt.toLocaleString()}</dd>
        </dl>
      </div>

      <div className="card">
        <h3>Findings ({total})</h3>
        <DataTable
          columns={[
            { id: "title", header: "Title", mobileFullWidth: true },
            { id: "severity", header: "Severity" },
            { id: "status", header: "Status" },
            { id: "lifetime", header: "Lifetime" },
            { id: "resource", header: "Resource", mobileFullWidth: true },
            { id: "fixed", header: "Fixed version" },
          ]}
          rows={findings.map((f) => ({
            key: f.id,
            cells: [
              f.title,
              <SeverityBadge key="sev" severity={f.severity} />,
              <FindingStatusBadge key="st" status={f.status} />,
              formatFindingLifetime(f.openIntervals, now),
              f.resource ?? "—",
              f.fixedVersion ?? <span className="muted">unfixed</span>,
            ],
          }))}
          emptyMessage="No findings on this run."
        />
        <Pagination
          nextCursor={nextCursor}
          pageCount={findings.length}
          total={total}
          take={DEFAULT_PAGE_SIZE}
        />
      </div>
    </div>
  );
}
