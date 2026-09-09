import { requireCompanySession } from "@/lib/session";
import { resolveAlertWindow, chartFromForWindow } from "@/lib/alert-window";
import { getLeakOverviewStats, getLeakFindingsTrend, getRecentLeakFindings } from "@/lib/leak-checking-queries";
import { DashboardTimePicker } from "@/components/DashboardTimePicker";
import { FilterBar } from "@/components/FilterBar";
import { DataTable } from "@/components/DataTable";
import { SeverityBadge } from "@/components/SeverityBadge";
import { SeverityBarChart } from "@/components/charts/SeverityBarChart";
import { SeverityTrendChart } from "@/components/charts/SeverityTrendChart";

const LEAK_SEVERITY_KEYS = ["high", "medium", "low"];

export default async function LeakCheckingPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; from?: string; to?: string; severity?: string; source?: string }>;
}) {
  const { companyId } = await requireCompanySession();
  const { window: windowParam, from, to, severity, source } = await searchParams;

  const effectiveWindowParam = windowParam === "1m" || windowParam === "5m" ? "1h" : windowParam;
  const timeWindow = resolveAlertWindow({ window: effectiveWindowParam, from, to });
  const range = { from: chartFromForWindow(timeWindow), to: timeWindow.to };

  const [stats, trend, recentFindings] = await Promise.all([
    getLeakOverviewStats(companyId, range),
    getLeakFindingsTrend(companyId, range),
    getRecentLeakFindings(companyId, { severity, source, ...range }),
  ]);

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="page-title" style={{ margin: 0 }}>
          Leak Checking
        </h2>
        <DashboardTimePicker minPreset="1h" />
      </div>

      <div className="card-grid">
        <div className="card">
          <div className="stat-label">Identities monitored</div>
          <div className="stat-value">{stats.totalIdentities}</div>
        </div>
        <div className="card">
          <div className="stat-label">Active identities</div>
          <div className="stat-value">{stats.activeIdentities}</div>
        </div>
        <div className="card">
          <div className="stat-label">Findings</div>
          <div className="stat-value">{stats.totalFindingsInWindow}</div>
        </div>
        <div className="card">
          <div className="stat-label">High severity</div>
          <div className="stat-value">{stats.highSeverityInWindow}</div>
        </div>
      </div>

      <div className="section card">
        <h3>Findings by severity</h3>
        <SeverityBarChart counts={stats.severityCounts} />
      </div>

      <div className="section card">
        <div className="trend-card-header">
          <h3>Findings trend</h3>
          <span className="muted" style={{ fontSize: 13 }}>
            {timeWindow.label}
          </span>
        </div>
        <SeverityTrendChart data={trend} keys={LEAK_SEVERITY_KEYS} />
      </div>

      <div className="section card">
        <h3>Recent findings</h3>
        <div className="toolbar">
          <FilterBar
            fields={[
              {
                name: "severity",
                label: "Severity",
                options: [
                  { value: "high", label: "high" },
                  { value: "medium", label: "medium" },
                  { value: "low", label: "low" },
                ],
              },
              {
                name: "source",
                label: "Provider",
                options: [
                  { value: "checkleaked", label: "CheckLeaked" },
                  { value: "leakcheck", label: "LeakCheck" },
                ],
              },
            ]}
          />
        </div>
        <DataTable
          columns={[
            { id: "breach", header: "Breach", mobileFullWidth: true },
            { id: "identity", header: "Identity" },
            { id: "severity", header: "Severity" },
            { id: "when", header: "Discovered" },
          ]}
          rows={recentFindings.map((f) => ({
            key: f.id,
            cells: [
              f.breachName,
              f.identity.identifierValue,
              <SeverityBadge key="sev" severity={f.severity} />,
              f.createdAt.toLocaleString(),
            ],
          }))}
          emptyMessage="No findings in this time window."
        />
      </div>
    </div>
  );
}
