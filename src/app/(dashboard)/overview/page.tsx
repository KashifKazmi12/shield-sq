import Link from "next/link";
import { requireCompanySession } from "@/lib/session";
import { resolveProject } from "@/lib/current-project";
import { getOverviewStats, getFindingsTrend, getRecentScans } from "@/lib/queries";
import { DataTable } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { SeverityBarChart } from "@/components/charts/SeverityBarChart";
import { SeverityTrendChart } from "@/components/charts/SeverityTrendChart";
import { StatusBadge } from "@/components/SeverityBadge";

export default async function OverviewPage({
  searchParams,
}: {
  // Next 16: page-level searchParams is a Promise (Async Request APIs).
  searchParams: Promise<{ project?: string; source?: string; status?: string }>;
}) {
  const { companyId } = await requireCompanySession();
  const { project: projectParam, source, status } = await searchParams;
  const project = await resolveProject(companyId, projectParam);

  if (!project) {
    return (
      <div>
        <h2 className="page-title">Overview</h2>
        <p className="muted">No projects yet. Create one and an ingest token in Settings.</p>
      </div>
    );
  }

  const [stats, trend30, recentScans] = await Promise.all([
    getOverviewStats(project.id),
    getFindingsTrend(project.id, 30),
    getRecentScans(project.id, {
      source: source as "trivy" | "falco" | undefined,
      status,
    }),
  ]);

  return (
    <div>
      <h2 className="page-title">Overview — {project.name}</h2>

      <div className="card-grid">
        <div className="card">
          <div className="stat-label">Health score</div>
          <div className="stat-value">{stats.healthScore}/100</div>
        </div>
        <div className="card">
          <div className="stat-label">Total findings</div>
          <div className="stat-value">{stats.totalFindings}</div>
        </div>
        <div className="card">
          <div className="stat-label">Open critical</div>
          <div className="stat-value">{stats.openCritical}</div>
        </div>
        <div className="card">
          <div className="stat-label">Scans (all time)</div>
          <div className="stat-value">{stats.totalScans}</div>
        </div>
      </div>

      <div className="section card">
        <h3>Findings by severity</h3>
        <SeverityBarChart counts={stats.severityCounts} />
      </div>

      <div className="section card">
        <h3>30-day trend</h3>
        <SeverityTrendChart data={trend30} />
      </div>

      <div className="section card">
        <h3>Recent pipeline / alert activity</h3>

        <div className="toolbar">
          <FilterBar
            fields={[
              {
                name: "source",
                label: "Source",
                options: [
                  { value: "trivy", label: "Trivy" },
                  { value: "falco", label: "Falco" },
                ],
              },
              {
                name: "status",
                label: "Status",
                options: [
                  { value: "success", label: "success" },
                  { value: "warning", label: "warning" },
                  { value: "failed", label: "failed" },
                ],
              },
            ]}
          />
        </div>

        <DataTable
          columns={[
            { id: "source", header: "Source" },
            { id: "repo", header: "Repo", mobileFullWidth: true },
            { id: "status", header: "Status" },
            { id: "findings", header: "Findings" },
            { id: "when", header: "When", mobileFullWidth: true },
          ]}
          rows={recentScans.map((scan) => ({
            key: scan.id,
            cells: [
              scan.source,
              scan.repo ?? "—",
              <StatusBadge key="st" status={scan.status} />,
              <Link key="f" href={`/runs/${scan.id}`}>{scan._count.findings}</Link>,
              scan.createdAt.toLocaleString(),
            ],
          }))}
          emptyMessage="No activity matches these filters."
        />
      </div>
    </div>
  );
}
