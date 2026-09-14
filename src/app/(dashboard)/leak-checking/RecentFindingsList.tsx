"use client";

import { ScrollLoadingList } from "@/components/ScrollLoadingList";
import { SeverityBadge } from "@/components/SeverityBadge";
import { loadMoreLeakFindings } from "./actions";

export type LeakFindingRow = {
  id: string;
  breachName: string;
  identifierValue: string;
  severity: string;
  passwordPwned: boolean | null;
  createdAt: string; // ISO
};

export function RecentFindingsList({
  initialRows,
  initialCursor,
  filters,
}: {
  initialRows: LeakFindingRow[];
  initialCursor: string | null;
  filters: { severity?: string; source?: string; from: string; to: string };
}) {
  return (
    <ScrollLoadingList
      initialRows={initialRows}
      initialCursor={initialCursor}
      loadMore={(cursor) => loadMoreLeakFindings({ cursor, ...filters })}
      columns={[
        { id: "breach", header: "Breach", mobileFullWidth: true },
        { id: "identity", header: "Identity" },
        { id: "severity", header: "Severity" },
        { id: "when", header: "Discovered" },
      ]}
      toRow={(f) => ({
        key: f.id,
        cells: [
          <>
            {f.breachName}
            {f.passwordPwned && (
              <span className="badge badge-critical" style={{ marginLeft: 6 }}>
                password compromised elsewhere
              </span>
            )}
          </>,
          f.identifierValue,
          <SeverityBadge key="sev" severity={f.severity} />,
          new Date(f.createdAt).toLocaleString(),
        ],
      })}
      emptyMessage="No findings in this time window."
    />
  );
}
