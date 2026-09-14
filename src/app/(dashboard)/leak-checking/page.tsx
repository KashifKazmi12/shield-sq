import { requireCompanySession } from "@/lib/session";
import { resolveAlertWindow, chartFromForWindow } from "@/lib/alert-window";
import {
  getLeakOverviewStats,
  getLeakFindingsTrend,
  getRecentLeakFindings,
  getOpenIdentityDnsFindings,
} from "@/lib/leak-checking-queries";
import { computeLeakRiskLevel } from "@/lib/identity-risk";
import { DashboardTimePicker } from "@/components/DashboardTimePicker";
import { FilterBar } from "@/components/FilterBar";
import { SeverityBadge } from "@/components/SeverityBadge";
import { SeverityBarChart } from "@/components/charts/SeverityBarChart";
import { SeverityTrendChart } from "@/components/charts/SeverityTrendChart";
import { RecentFindingsList } from "./RecentFindingsList";
import { IdentityDnsFindingsList } from "./IdentityDnsFindingsList";

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

  const [stats, trend, recentFindings, dnsFindings] = await Promise.all([
    getLeakOverviewStats(companyId, range),
    getLeakFindingsTrend(companyId, range),
    getRecentLeakFindings(companyId, { severity, source, ...range }),
    getOpenIdentityDnsFindings(companyId),
  ]);
  const riskLevel = computeLeakRiskLevel(stats);

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
          <div className="muted" style={{ fontSize: 12 }}>
            {stats.activeIdentities} active
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Findings</div>
          <div className="stat-value">{stats.totalFindingsInWindow}</div>
        </div>
        <div className="card">
          <div className="stat-label">High severity</div>
          <div className="stat-value">{stats.highSeverityInWindow}</div>
        </div>
        <div className="card">
          <div className="stat-label">Passwords compromised elsewhere</div>
          <div className="stat-value">{stats.passwordsPwnedInWindow}</div>
        </div>
        <div className="card">
          <div className="stat-label">Open DNS gaps (SPF/DMARC/DKIM)</div>
          <div className="stat-value">{stats.openDnsFindings}</div>
        </div>
        <div className="card">
          <div className="stat-label">Overall risk</div>
          <div className="stat-value"><SeverityBadge severity={riskLevel} /></div>
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
            ]}
          />
        </div>
        <RecentFindingsList
          initialRows={recentFindings.findings.map((f) => ({
            id: f.id,
            breachName: f.breachName,
            identifierValue: f.identity.identifierValue,
            severity: f.severity,
            passwordPwned: f.passwordPwned,
            createdAt: f.createdAt.toISOString(),
          }))}
          initialCursor={recentFindings.nextCursor}
          filters={{ severity, source, from: range.from.toISOString(), to: range.to.toISOString() }}
        />
      </div>

      <div className="section card">
        <h3>Identity DNS findings (SPF / DMARC / DKIM)</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Checked against each monitored email identity's domain — a
          spoofable domain is a real risk even without a direct credential leak.
        </p>
        <IdentityDnsFindingsList
          initialRows={dnsFindings.findings.map((f) => ({
            id: f.id,
            identifierValue: f.identity.identifierValue,
            type: f.type,
            severity: f.severity,
            title: f.title,
            detectedAt: f.detectedAt.toISOString(),
          }))}
          initialCursor={dnsFindings.nextCursor}
        />
      </div>
    </div>
  );
}
