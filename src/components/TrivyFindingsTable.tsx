"use client";

import { useMemo, useState } from "react";
import { DataTable, type DataTableColumn } from "./DataTable";
import { Drawer } from "./Drawer";
import { SeverityBadge } from "./SeverityBadge";

type TrivyFinding = {
  id: string;
  title: string;
  description: string | null;
  resource: string | null;
  severity: string;
  fixedVersion: string | null;
  detectedAt: Date | string;
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
  { id: "resource", header: "Image / target", mobileFullWidth: true },
  { id: "repo", header: "Repo" },
  { id: "fix", header: "Fix available" },
  { id: "detected", header: "Detected" },
];

export function TrivyFindingsTable({ findings }: { findings: TrivyFinding[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = findings.find((f) => f.id === selectedId) ?? null;

  const rows = useMemo(
    () =>
      findings.map((f) => ({
        key: f.id,
        cells: [
          f.title,
          <SeverityBadge key="sev" severity={f.severity} />,
          f.resource ?? "—",
          f.scan.repo ?? "—",
          f.fixedVersion ?? <span className="muted">unfixed</span>,
          new Date(f.detectedAt).toLocaleString(),
        ],
      })),
    [findings]
  );

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
            <div className="drawer-meta">
              <SeverityBadge severity={selected.severity} />
            </div>
            <p className="drawer-prose">
              {selected.description ?? "No description provided."}
            </p>
            <dl className="drawer-dl">
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
              <dt>Detected</dt>
              <dd>{new Date(selected.detectedAt).toLocaleString()}</dd>
            </dl>
          </>
        )}
      </Drawer>
    </>
  );
}
