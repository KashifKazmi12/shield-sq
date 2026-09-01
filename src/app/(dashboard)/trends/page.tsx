import { requireCompanySession } from "@/lib/session";
import { resolveProject } from "@/lib/current-project";
import { getFindingsTrend, getMeanTimeToFix, getSeverityCounts } from "@/lib/queries";
import { FilterBar } from "@/components/FilterBar";
import { SeverityTrendChart } from "@/components/charts/SeverityTrendChart";
import { SeverityBarChart } from "@/components/charts/SeverityBarChart";

export default async function TrendsPage({
  searchParams,
}: {
  // Next 16: page-level searchParams is a Promise (Async Request APIs).
  searchParams: Promise<{ project?: string; tool?: "trivy" | "falco" }>;
}) {
  const { companyId } = await requireCompanySession();
  const { project: projectParam, tool } = await searchParams;
  const project = await resolveProject(companyId, projectParam);
  if (!project) {
    return <p className="muted">No project configured yet.</p>;
  }

  const [trend30, trend90, mttf, severityNow] = await Promise.all([
    getFindingsTrend(project.id, 30, tool),
    getFindingsTrend(project.id, 90, tool),
    getMeanTimeToFix(project.id),
    getSeverityCounts(project.id, tool),
  ]);

  return (
    <div>
      <h2 className="page-title">Trends</h2>

      <div className="toolbar">
        <FilterBar
          fields={[
            {
              name: "tool",
              label: "Tool",
              options: [
                { value: "trivy", label: "Trivy" },
                { value: "falco", label: "Falco" },
              ],
            },
          ]}
        />
      </div>

      <div className="card-grid">
        <div className="card">
          <div className="stat-label">Mean time to fix</div>
          <div className="stat-value">{mttf !== null ? `${mttf.toFixed(1)}d` : "—"}</div>
        </div>
      </div>

      <div className="section card">
        <h3>Current severity distribution</h3>
        <SeverityBarChart counts={severityNow} />
      </div>

      <div className="section card">
        <h3>30-day trend</h3>
        <SeverityTrendChart data={trend30} />
      </div>

      <div className="section card">
        <h3>90-day trend</h3>
        <SeverityTrendChart data={trend90} />
      </div>
    </div>
  );
}
