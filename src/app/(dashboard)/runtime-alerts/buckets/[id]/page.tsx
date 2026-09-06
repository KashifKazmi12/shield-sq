import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireCompanySession } from "@/lib/session";
import { getScan, listScanFindings } from "@/lib/queries";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { DataTable } from "@/components/DataTable";
import { Pagination } from "@/components/Pagination";
import { SeverityBadge, StatusBadge } from "@/components/SeverityBadge";

/** Falco ingest-bucket detail — kept under Runtime Alerts, not Pipeline Runs. */
export default async function AlertBucketPage({
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

  if (scan.source !== "falco") {
    const qs = new URLSearchParams();
    if (projectParam) qs.set("project", projectParam);
    if (cursor) qs.set("cursor", cursor);
    const q = qs.toString();
    redirect(`/runs/${scan.id}${q ? `?${q}` : ""}`);
  }

  const { findings, nextCursor, total } = await listScanFindings(id, { cursor });
  const projectQs = `?project=${encodeURIComponent(projectParam || scan.projectId)}`;

  return (
    <div>
      <h2 className="page-title">Alert bucket — {scan.createdAt.toLocaleString()}</h2>

      <div className="card section">
        <dl>
          <dt className="muted">Source</dt>
          <dd>falco</dd>
          <dt className="muted">Status</dt>
          <dd>
            <StatusBadge status={scan.status} />
          </dd>
          <dt className="muted">Received at</dt>
          <dd>{scan.createdAt.toLocaleString()}</dd>
          <dt className="muted">Project</dt>
          <dd>{scan.project.name}</dd>
        </dl>
        <p className="muted" style={{ marginBottom: 0, marginTop: 12, fontSize: 13 }}>
          <Link href={`/runtime-alerts/feed${projectQs}`}>← Back to alerts feed</Link>
        </p>
      </div>

      <div className="card">
        <h3>Alerts ({total})</h3>
        <DataTable
          columns={[
            { id: "title", header: "Rule", mobileFullWidth: true },
            { id: "severity", header: "Severity" },
            { id: "resource", header: "Host / pod", mobileFullWidth: true },
            { id: "detected", header: "Detected", mobileFullWidth: true },
          ]}
          rows={findings.map((f) => ({
            key: f.id,
            cells: [
              f.title,
              <SeverityBadge key="sev" severity={f.severity} />,
              f.resource ?? "—",
              new Date(f.detectedAt).toLocaleString(),
            ],
          }))}
          emptyMessage="No alerts in this bucket."
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
