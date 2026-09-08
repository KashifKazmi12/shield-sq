"use client";

import { useMemo, useState } from "react";
import { DataTable, type DataTableColumn } from "./DataTable";
import { Drawer } from "./Drawer";
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

const DETAIL_WORD_LIMIT = 40;

const columns: DataTableColumn[] = [
  { id: "time", header: "Time" },
  { id: "severity", header: "Severity" },
  { id: "rule", header: "Rule", mobileFullWidth: true },
  { id: "resource", header: "Host / pod", mobileFullWidth: true },
  { id: "detail", header: "Detail", mobileFullWidth: true, className: "col-detail" },
];

function clipWords(text: string, maxWords: number): { clipped: string; truncated: boolean } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return { clipped: text, truncated: false };
  return { clipped: `${words.slice(0, maxWords).join(" ")}…`, truncated: true };
}

export function FalcoFeed({ findings }: { findings: FalcoFinding[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = findings.find((f) => f.id === selectedId) ?? null;

  const rows = useMemo(
    () =>
      findings.map((f) => {
        const raw = f.description?.trim() || "";
        const { clipped, truncated } = raw
          ? clipWords(raw, DETAIL_WORD_LIMIT)
          : { clipped: "—", truncated: false };
        return {
          key: f.id,
          cells: [
            new Date(f.detectedAt).toLocaleString(),
            <SeverityBadge key="sev" severity={f.severity} />,
            f.ruleName ?? f.title,
            f.resource ?? "—",
            <span key="d" className={`detail-clip${truncated ? " is-truncated" : ""}`}>
              {clipped}
            </span>,
          ],
        };
      }),
    [findings]
  );

  return (
    <>
      <div className="card falco-feed" style={{ padding: 12 }}>
        <DataTable
          columns={columns}
          rows={rows}
          emptyMessage="No runtime alerts match these filters."
          onRowClick={setSelectedId}
        />
      </div>

      <Drawer
        open={Boolean(selected)}
        title={selected?.ruleName ?? selected?.title ?? "Alert"}
        onClose={() => setSelectedId(null)}
      >
        {selected && (
          <>
            <div className="drawer-meta" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <SeverityBadge severity={selected.severity} />
            </div>
            <p className="drawer-prose" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {selected.description ?? "No detail provided."}
            </p>
            <dl className="drawer-dl">
              <dt>Host / pod</dt>
              <dd>{selected.resource ?? "—"}</dd>
              <dt>Rule</dt>
              <dd>{selected.ruleName ?? selected.title}</dd>
              <dt>Detected</dt>
              <dd>{new Date(selected.detectedAt).toLocaleString()}</dd>
            </dl>
          </>
        )}
      </Drawer>
    </>
  );
}
