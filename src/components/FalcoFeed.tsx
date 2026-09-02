"use client";

import { useMemo } from "react";
import { DataTable, type DataTableColumn } from "./DataTable";
import { SeverityBadge } from "./SeverityBadge";

type FalcoFinding = {
  id: string;
  title: string;
  description: string | null;
  resource: string | null;
  severity: string;
  ruleName: string | null;
  detectedAt: Date | string;
};

const columns: DataTableColumn[] = [
  { id: "time", header: "Time" },
  { id: "severity", header: "Severity" },
  { id: "rule", header: "Rule", mobileFullWidth: true },
  { id: "resource", header: "Host / pod", mobileFullWidth: true },
  { id: "detail", header: "Detail", mobileFullWidth: true },
];

export function FalcoFeed({ findings }: { findings: FalcoFinding[] }) {
  const rows = useMemo(
    () =>
      findings.map((f) => ({
        key: f.id,
        cells: [
          new Date(f.detectedAt).toLocaleString(),
          <SeverityBadge key="sev" severity={f.severity} />,
          f.ruleName ?? f.title,
          f.resource ?? "—",
          <span key="d" className="muted">{f.description ?? "—"}</span>,
        ],
      })),
    [findings]
  );

  return (
    <div className="card" style={{ padding: 12 }}>
      <DataTable
        columns={columns}
        rows={rows}
        emptyMessage="No runtime alerts match these filters."
      />
    </div>
  );
}
