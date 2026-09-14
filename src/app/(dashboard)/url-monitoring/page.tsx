import { requireCompanySession } from "@/lib/session";
import { resolveAlertWindow, chartFromForWindow } from "@/lib/alert-window";
import {
  getSiteOverviewStats,
  getStatusBreakdown,
  getLatencyTrend,
  getRecentSiteScans,
  getSiteFindings,
} from "@/lib/url-monitoring-queries";
import { DashboardTimePicker } from "@/components/DashboardTimePicker";
import { FilterBar } from "@/components/FilterBar";
import { SeverityBarChart } from "@/components/charts/SeverityBarChart";
import { LatencyTrendChart } from "@/components/charts/LatencyTrendChart";
import { SEVERITIES } from "@/lib/constants";
import { RecentScansList } from "./RecentScansList";
import { SecurityFindingsList } from "./SecurityFindingsList";

const SITE_FINDING_TYPES = ["ssl_cert", "caa_record", "subdomain"] as const;
const SITE_FINDING_TYPE_LABELS: Record<(typeof SITE_FINDING_TYPES)[number], string> = {
  ssl_cert: "SSL/TLS certificate",
  caa_record: "CAA record",
  subdomain: "Subdomain discovery",
};

const STATUS_COLORS: Record<string, string> = {
  "2xx": "#1a7f37",
  "3xx": "#0969da",
  "4xx": "#bc4c00",
  "5xx": "#cf222e",
  unreachable: "#6e7781",
};

export default async function UrlMonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{
    window?: string;
    from?: string;
    to?: string;
    status?: "up" | "down";
    findingType?: string;
    findingSeverity?: string;
  }>;
}) {
  const { companyId } = await requireCompanySession();
  const { window: windowParam, from, to, status, findingType, findingSeverity } = await searchParams;

  // 1h is the shortest window offered here (see DashboardTimePicker minPreset
  // below) — clamp a stale/manually-edited "1m"/"5m" in the URL to it too.
  const effectiveWindowParam = windowParam === "1m" || windowParam === "5m" ? "1h" : windowParam;
  const timeWindow = resolveAlertWindow({ window: effectiveWindowParam, from, to });
  const range = { from: chartFromForWindow(timeWindow), to: timeWindow.to };

  const [stats, statusBreakdown, latencyTrend, recentScans, siteFindings] = await Promise.all([
    getSiteOverviewStats(companyId, range),
    getStatusBreakdown(companyId),
    getLatencyTrend(companyId, range),
    getRecentSiteScans(companyId, { status, ...range }), // { scans, nextCursor } — RecentScansList loads more on scroll
    getSiteFindings(companyId, { type: findingType, severity: findingSeverity }), // { findings, nextCursor } — SecurityFindingsList loads more on scroll
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
        <h3>Security findings</h3>
        <div className="toolbar">
          <FilterBar
            fields={[
              {
                name: "findingType",
                label: "Check",
                options: SITE_FINDING_TYPES.map((t) => ({ value: t, label: SITE_FINDING_TYPE_LABELS[t] })),
              },
              {
                name: "findingSeverity",
                label: "Severity",
                options: SEVERITIES.map((s) => ({ value: s, label: s })),
              },
            ]}
          />
        </div>
        <SecurityFindingsList
          initialRows={siteFindings.findings.map((f) => ({
            id: f.id,
            domain: f.site.domain,
            type: f.type,
            severity: f.severity,
            title: f.title,
            detectedAt: f.detectedAt.toISOString(),
          }))}
          initialCursor={siteFindings.nextCursor}
          filters={{ type: findingType, severity: findingSeverity }}
        />
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
        <RecentScansList
          initialRows={recentScans.scans.map((s) => ({
            id: s.id,
            target: s.endpoint ? `${s.site.domain}${s.endpoint.path}` : s.site.domain,
            statusCode: s.statusCode,
            latencyMs: s.latencyMs,
            scannedAt: s.scannedAt.toISOString(),
          }))}
          initialCursor={recentScans.nextCursor}
          filters={{ status, from: range.from.toISOString(), to: range.to.toISOString() }}
        />
      </div>
    </div>
  );
}
