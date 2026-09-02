import { notFound } from "next/navigation";
import { requireCompanySession } from "@/lib/session";
import { getScanWithFindings } from "@/lib/queries";
import { severityRank } from "@/lib/severity";
import { DataTable } from "@/components/DataTable";
import { SeverityBadge, StatusBadge } from "@/components/SeverityBadge";

// Next 16: page-level params is a Promise (Async Request APIs).
export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { companyId } = await requireCompanySession();
  const { id } = await params;
  const scan = await getScanWithFindings(id);
  // A scan id from another tenant must 404, not leak — cuids aren't
  // guessable, but this is the actual isolation boundary, not obscurity.
  if (!scan || scan.project.companyId !== companyId) notFound();

  const findings = [...scan.findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  return (
    <div>
      <h2 className="page-title">
        {scan.source === "trivy" ? scan.repo ?? scan.id : `Falco bucket — ${scan.createdAt.toLocaleString()}`}
      </h2>

      <div className="card section">
        <dl>
          <dt className="muted">Source</dt>
          <dd>{scan.source}</dd>
          <dt className="muted">Status</dt>
          <dd><StatusBadge status={scan.status} /></dd>
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
        <h3>Findings ({findings.length})</h3>
        <DataTable
          columns={[
            { id: "title", header: "Title", mobileFullWidth: true },
            { id: "severity", header: "Severity" },
            { id: "resource", header: "Resource", mobileFullWidth: true },
            { id: "fixed", header: "Fixed version" },
          ]}
          rows={findings.map((f) => ({
            key: f.id,
            cells: [
              f.title,
              <SeverityBadge key="sev" severity={f.severity} />,
              f.resource ?? "—",
              f.fixedVersion ?? <span className="muted">unfixed</span>,
            ],
          }))}
          emptyMessage="No findings on this run."
        />
      </div>
    </div>
  );
}
