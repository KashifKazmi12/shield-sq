"use client";

import { ScrollLoadingList } from "@/components/ScrollLoadingList";
import { loadMoreRecentScans } from "./actions";

export type RecentScanRow = {
  id: string;
  target: string;
  statusCode: number | null;
  latencyMs: number | null;
  scannedAt: string; // ISO — serialized across the server action boundary
};

function statusBadge(statusCode: number | null) {
  if (statusCode == null) return <span className="badge badge-status-failed">unreachable</span>;
  if (statusCode >= 200 && statusCode < 400) return <span className="badge badge-status-success">{statusCode}</span>;
  return <span className="badge badge-status-failed">{statusCode}</span>;
}

export function RecentScansList({
  initialRows,
  initialCursor,
  filters,
}: {
  initialRows: RecentScanRow[];
  initialCursor: string | null;
  filters: { status?: "up" | "down"; from: string; to: string };
}) {
  return (
    <ScrollLoadingList
      initialRows={initialRows}
      initialCursor={initialCursor}
      loadMore={(cursor) => loadMoreRecentScans({ cursor, ...filters })}
      columns={[
        { id: "target", header: "Target", mobileFullWidth: true },
        { id: "status", header: "Status" },
        { id: "latency", header: "Latency" },
        { id: "scannedAt", header: "Scanned" },
      ]}
      toRow={(s) => ({
        key: s.id,
        cells: [
          s.target,
          statusBadge(s.statusCode),
          s.latencyMs != null ? `${Math.round(s.latencyMs)}ms` : "—",
          new Date(s.scannedAt).toLocaleString(),
        ],
      })}
      emptyMessage="No scans in this time window."
    />
  );
}
