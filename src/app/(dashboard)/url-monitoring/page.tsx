import { requireCompanySession } from "@/lib/session";
import { resolveAlertWindow, chartFromForWindow } from "@/lib/alert-window";
import {
  getSiteOverviewStats,
  getStatusBreakdown,
  getLatencyTrend,
  getRecentSiteScans,
} from "@/lib/url-monitoring-queries";
import { DashboardTimePicker } from "@/components/DashboardTimePicker";
import { FilterBar } from "@/components/FilterBar";
import { DataTable } from "@/components/DataTable";
import { SeverityBarChart } from "@/components/charts/SeverityBarChart";
import { LatencyTrendChart } from "@/components/charts/LatencyTrendChart";

const STATUS_COLORS: Record<string, string> = {
  "2xx": "#1a7f37",
  "3xx": "#0969da",
  "4xx": "#bc4c00",
  "5xx": "#cf222e",
  unreachable: "#6e7781",
};

function statusBadge(statusCode: number | null) {
  if (statusCode == null) return <span className="badge badge-status-failed">unreachable</span>;
  if (statusCode >= 200 && statusCode < 400) return <span className="badge badge-status-success">{statusCode}</span>;
  return <span className="badge badge-status-failed">{statusCode}</span>;
}

export default async function UrlMonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; from?: string; to?: string; status?: "up" | "down" }>;
}) {
  const { companyId } = await requireCompanySession();
  const { window: windowParam, from, to, status } = await searchParams;

  // 1h is the shortest window offered here (see DashboardTimePicker minPreset
  // below) — clamp a stale/manually-edited "1m"/"5m" in the URL to it too.
  const effectiveWindowParam = windowParam === "1m" || windowParam === "5m" ? "1h" : windowParam;
  const timeWindow = resolveAlertWindow({ window: effectiveWindowParam, from, to });
  const range = { from: chartFromForWindow(timeWindow), to: timeWindow.to };

  const [stats, statusBreakdown, latencyTrend, recentScans] = await Promise.all([
    getSiteOverviewStats(companyId, range),
    getStatusBreakdown(companyId),
    getLatencyTrend(companyId, range),
    getRecentSiteScans(companyId, { status, ...range }),
  ]);

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="page-title" style={{ margin: 0 }}>
          URL Monitoring
        </h2>
        <DashboardTimePicker minPreset="1h" />
      </div>

      <div className="card-grid">
        <div className="card">
          <div className="stat-label">Sites monitored</div>
          <div className="stat-value">{stats.totalSites}</div>
        </div>
        <div className="card">
          <div className="stat-label">Endpoints monitored</div>
          <div className="stat-value">{stats.totalEndpoints}</div>
        </div>
        <div className="card">
          <div className="stat-label">Sites down now</div>
          <div className="stat-value">{stats.sitesDown}</div>
        </div>
        <div className="card">
          <div className="stat-label">Avg latency</div>
          <div className="stat-value">
            {stats.avgLatencyMs != null ? `${Math.round(stats.avgLatencyMs)}ms` : "—"}
          </div>
        </div>
      </div>

      <div className="section card">
        <h3>Current status breakdown</h3>
        <SeverityBarChart counts={statusBreakdown} colors={STATUS_COLORS} />
      </div>

      <div className="section card">
        <div className="trend-card-header">
          <h3>Latency trend</h3>
          <span className="muted" style={{ fontSize: 13 }}>
            {timeWindow.label}
          </span>
        </div>
        <LatencyTrendChart data={latencyTrend} />
      </div>

      <div className="section card">
        <h3>Recent scans</h3>
        <div className="toolbar">
          <FilterBar
            fields={[
              {
                name: "status",
                label: "Status",
                options: [
                  { value: "up", label: "up" },
                  { value: "down", label: "down" },
                ],
              },
            ]}
          />
        </div>
        <DataTable
          columns={[
            { id: "target", header: "Target", mobileFullWidth: true },
            { id: "status", header: "Status" },
            { id: "latency", header: "Latency" },
            { id: "scannedAt", header: "Scanned" },
          ]}
          rows={recentScans.map((s) => ({
            key: s.id,
            cells: [
              s.endpoint ? `${s.site.domain}${s.endpoint.path}` : s.site.domain,
              statusBadge(s.statusCode),
              s.latencyMs != null ? `${Math.round(s.latencyMs)}ms` : "—",
              s.scannedAt.toLocaleString(),
            ],
          }))}
          emptyMessage="No scans in this time window."
        />
      </div>
    </div>
  );
}
