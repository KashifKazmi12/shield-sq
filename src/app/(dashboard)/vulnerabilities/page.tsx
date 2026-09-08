import Link from "next/link";
import { requireCompanySession } from "@/lib/session";
import { resolveProject } from "@/lib/current-project";
import {
  getOverviewStats,
  getRecentScans,
  getTopVulnerabilities,
  getTrivyOpenTrend,
} from "@/lib/queries";
import { resolveAlertWindow, chartFromForWindow } from "@/lib/alert-window";
import { formatFindingLifetime } from "@/lib/finding-lifecycle";
import { DataTable } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { SeverityBarChart } from "@/components/charts/SeverityBarChart";
import { SeverityTrendChart } from "@/components/charts/SeverityTrendChart";
import { DashboardTimePicker } from "@/components/DashboardTimePicker";
import { FindingStatusBadge, SeverityBadge, StatusBadge } from "@/components/SeverityBadge";

export default async function VulnerabilitiesDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string;
    status?: string;
    window?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { companyId } = await requireCompanySession();
  const { project: projectParam, status, window: windowParam, from, to } = await searchParams;
  const project = await resolveProject(companyId, projectParam);

  if (!project) {
    return (
      <div>
        <h2 className="page-title">Vulnerabilities</h2>
        <p className="muted">No projects yet. Create one and an ingest token in Settings.</p>
      </div>
    );
  }

  const timeWindow = resolveAlertWindow({ window: windowParam, from, to });
  const trendFrom = chartFromForWindow(timeWindow);
  const now = new Date();
  const projectQs = `?project=${encodeURIComponent(project.id)}`;
  const timeOpts = {
    detectedAfter: timeWindow.from ?? undefined,
    detectedBefore: timeWindow.key === "custom" ? timeWindow.to : undefined,
  };

  const [stats, trend, recentScans, topVulnerabilities] = await Promise.all([
    getOverviewStats(project.id, "trivy", timeOpts),
    getTrivyOpenTrend(project.id, { from: trendFrom, to: timeWindow.to }),
    getRecentScans(project.id, {
      source: "trivy",
      status,
      createdAfter: timeOpts.detectedAfter,
      createdBefore: timeOpts.detectedBefore,
    }),
    getTopVulnerabilities(project.id, 5, timeOpts),
  ]);

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="page-title" style={{ margin: 0 }}>
          Vulnerabilities — {project.name}
        </h2>
        <DashboardTimePicker />
      </div>

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
          <div className="stat-label">Opened / resolved</div>
          <div className="stat-value">
            {stats.openFindings} / {stats.resolvedFindings}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Scans</div>
          <div className="stat-value">{stats.totalScans}</div>
        </div>
      </div>

      <div className="section card">
        <div className="trend-card-header">
          <h3>Top 5 vulnerabilities</h3>
          <Link
            href={`/vulnerabilities/findings${projectQs}`}
            className="muted"
            style={{ fontSize: 13 }}
          >
            View all →
          </Link>
        </div>
        <DataTable
          columns={[
            { id: "cve", header: "CVE", mobileFullWidth: true },
            { id: "severity", header: "Severity" },
            { id: "status", header: "Status" },
            { id: "lifetime", header: "Lifetime" },
            { id: "resource", header: "Image / target", mobileFullWidth: true },
            { id: "repo", header: "Repo" },
            { id: "detected", header: "Detected", mobileFullWidth: true },
          ]}
          rows={topVulnerabilities.map((f) => ({
            key: f.id,
            cells: [
              f.title,
              <SeverityBadge key="sev" severity={f.severity} />,
              <FindingStatusBadge key="st" status={f.status} />,
              formatFindingLifetime(f.openIntervals, now),
              f.resource ?? "—",
              f.scan.repo ?? "—",
              new Date(f.detectedAt).toLocaleString(),
            ],
          }))}
          emptyMessage="No open vulnerabilities."
        />
      </div>

      <div className="section card">
        <h3>Findings by severity</h3>
        <SeverityBarChart counts={stats.severityCounts} />
      </div>

      <div className="section card">
        <div className="trend-card-header">
          <h3>Severity trend</h3>
          <span className="muted" style={{ fontSize: 13 }}>
            {timeWindow.label}
          </span>
        </div>
        <p className="muted" style={{ marginTop: 0, marginBottom: 12, fontSize: 13 }}>
          Open findings by day (stays counted until resolved; returns on reopen).
        </p>
        <SeverityTrendChart data={trend} />
      </div>

      <div className="section card">
        <h3>Recent pipeline activity</h3>
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
            { id: "repo", header: "Repo", mobileFullWidth: true },
            { id: "status", header: "Status" },
            { id: "findings", header: "Findings" },
            { id: "when", header: "When", mobileFullWidth: true },
          ]}
          rows={recentScans.map((scan) => ({
            key: scan.id,
            cells: [
              scan.repo ?? "—",
              <StatusBadge key="st" status={scan.status} />,
              <Link key="f" href={`/runs/${scan.id}?project=${encodeURIComponent(project.id)}`}>
                {scan._count.observations}
              </Link>,
              scan.createdAt.toLocaleString(),
            ],
          }))}
          emptyMessage="No pipeline activity in this time window."
        />
      </div>
    </div>
  );
}
