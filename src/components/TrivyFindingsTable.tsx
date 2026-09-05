"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable, type DataTableColumn } from "./DataTable";
import { Drawer } from "./Drawer";
import { FindingStatusBadge, SeverityBadge } from "./SeverityBadge";
import {
  formatFindingLifetime,
  lifecycleEventsFromIntervals,
  parseOpenIntervals,
} from "@/lib/finding-lifecycle";

type TrivyFinding = {
  id: string;
  title: string;
  description: string | null;
  resource: string | null;
  severity: string;
  fixedVersion: string | null;
  detectedAt: Date | string;
  status: string;
  openIntervals: unknown;
  scan: {
    repo: string | null;
    branch: string | null;
    commitSha: string | null;
    pipelineId: string | null;
    createdAt: Date | string;
  };
};

const columns: DataTableColumn[] = [
  { id: "cve", header: "CVE", mobileFullWidth: true },
  { id: "severity", header: "Severity" },
  { id: "status", header: "Status" },
  { id: "lifetime", header: "Lifetime" },
  { id: "resource", header: "Image / target", mobileFullWidth: true },
  { id: "repo", header: "Repo" },
  { id: "fix", header: "Fix available" },
  { id: "detected", header: "Detected" },
];

function formatEventLabel(type: string) {
  if (type === "reopened") return "Reopened";
  if (type === "resolved") return "Resolved";
  return "Opened";
}

export function TrivyFindingsTable({ findings }: { findings: TrivyFinding[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const selected = findings.find((f) => f.id === selectedId) ?? null;

  // Refresh lifetime labels about once a minute (we never show seconds).
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const rows = useMemo(
    () =>
      findings.map((f) => ({
        key: f.id,
        cells: [
          f.title,
          <SeverityBadge key="sev" severity={f.severity} />,
          <FindingStatusBadge key="st" status={f.status} />,
          formatFindingLifetime(f.openIntervals, now),
          f.resource ?? "—",
          f.scan.repo ?? "—",
          f.fixedVersion ?? <span className="muted">unfixed</span>,
          new Date(f.detectedAt).toLocaleString(),
        ],
      })),
    [findings, now]
  );

  const timeline = selected
    ? lifecycleEventsFromIntervals(parseOpenIntervals(selected.openIntervals))
    : [];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        emptyMessage="No findings match these filters."
        onRowClick={setSelectedId}
      />

      <Drawer
        open={Boolean(selected)}
        title={selected?.title ?? "Finding"}
        onClose={() => setSelectedId(null)}
      >
        {selected && (
          <>
            <div className="drawer-meta" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <SeverityBadge severity={selected.severity} />
              <FindingStatusBadge status={selected.status} />
            </div>
            <p className="drawer-prose">
              {selected.description ?? "No description provided."}
            </p>
            <dl className="drawer-dl">
              <dt>Lifetime</dt>
              <dd>{formatFindingLifetime(selected.openIntervals, now)}</dd>
              <dt>Target</dt>
              <dd>{selected.resource ?? "—"}</dd>
              <dt>Fixed version</dt>
              <dd>{selected.fixedVersion ?? "Not yet fixed upstream"}</dd>
              <dt>Repo</dt>
              <dd>{selected.scan.repo ?? "—"}</dd>
              <dt>Branch</dt>
              <dd>{selected.scan.branch ?? "—"}</dd>
              <dt>Commit</dt>
              <dd>{selected.scan.commitSha ?? "—"}</dd>
              <dt>Pipeline</dt>
              <dd>{selected.scan.pipelineId ?? "—"}</dd>
              <dt>First detected</dt>
              <dd>{new Date(selected.detectedAt).toLocaleString()}</dd>
            </dl>

            <h4 style={{ margin: "20px 0 8px", fontSize: 13, fontWeight: 600 }}>History</h4>
            {timeline.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>No lifecycle history yet.</p>
            ) : (
              <ul className="finding-timeline">
                {timeline.map((event, i) => (
                  <li key={`${event.type}-${event.at}-${i}`}>
                    <span className={`finding-timeline-dot finding-timeline-${event.type}`} />
                    <div>
                      <strong>{formatEventLabel(event.type)}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {new Date(event.at).toLocaleString()}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
