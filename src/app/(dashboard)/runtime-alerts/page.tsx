import Link from "next/link";
import { requireCompanySession } from "@/lib/session";
import { resolveProject } from "@/lib/current-project";
import { getOverviewStats, getFindingsTrend, getRecentScans } from "@/lib/queries";
import { resolveTrendWindow } from "@/lib/trend-range";
import { DataTable } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { SeverityBarChart } from "@/components/charts/SeverityBarChart";
import { SeverityTrendChart } from "@/components/charts/SeverityTrendChart";
import { TrendRangePicker } from "@/components/TrendRangePicker";
import { StatusBadge } from "@/components/SeverityBadge";

export default async function RuntimeAlertsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string;
    status?: string;
    range?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { companyId } = await requireCompanySession();
  const { project: projectParam, status, range, from, to } = await searchParams;
  const project = await resolveProject(companyId, projectParam);

  if (!project) {
    return (
      <div>
        <h2 className="page-title">Runtime Alerts</h2>
        <p className="muted">No projects yet. Create one and an ingest token in Settings.</p>
      </div>
    );
  }

  const window = resolveTrendWindow({ range, from, to });

  const [stats, trend, recentScans] = await Promise.all([
    getOverviewStats(project.id, "falco"),
    getFindingsTrend(project.id, { from: window.from, to: window.to, tool: "falco" }),
    getRecentScans(project.id, { source: "falco", status }),
  ]);

  return (
    <div>
      <h2 className="page-title">Runtime Alerts — {project.name}</h2>

      <div className="card-grid">
        <div className="card">
          <div className="stat-label">Health score</div>
          <div className="stat-value">{stats.healthScore}/100</div>
        </div>
        <div className="card">
          <div className="stat-label">Total alerts</div>
          <div className="stat-value">{stats.totalFindings}</div>
        </div>
        <div className="card">
          <div className="stat-label">Critical alerts</div>
          <div className="stat-value">{stats.openCritical}</div>
        </div>
        <div className="card">
          <div className="stat-label">Ingest buckets</div>
          <div className="stat-value">{stats.totalScans}</div>
        </div>
      </div>

      <div className="section card">
        <h3>Alerts by severity</h3>
        <SeverityBarChart counts={stats.severityCounts} />
      </div>

      <div className="section card">
        <div className="trend-card-header">
          <h3>Severity trend</h3>
          <TrendRangePicker />
        </div>
        <SeverityTrendChart data={trend} />
      </div>

      <div className="section card">
        <h3>Recent alert activity</h3>
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
            ]}
          />
        </div>
        <DataTable
          columns={[
            { id: "status", header: "Status" },
            { id: "findings", header: "Alerts" },
            { id: "when", header: "When", mobileFullWidth: true },
          ]}
          rows={recentScans.map((scan) => ({
            key: scan.id,
            cells: [
              <StatusBadge key="st" status={scan.status} />,
              <Link
                key="f"
                href={`/runtime-alerts/buckets/${scan.id}?project=${encodeURIComponent(project.id)}`}
              >
                {scan._count.observations}
              </Link>,
              scan.createdAt.toLocaleString(),
            ],
          }))}
          emptyMessage="No alert activity yet."
        />
      </div>
    </div>
  );
}
