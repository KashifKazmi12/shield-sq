"use client";

import { ScrollLoadingList } from "@/components/ScrollLoadingList";
import { loadMoreActivity } from "./actions";

export type ActivityRow = {
  id: string;
  createdAt: string; // ISO
  actorEmail: string;
  action: string;
  detail: string | null;
};

export function ActivityList({
  initialRows,
  initialCursor,
}: {
  initialRows: ActivityRow[];
  initialCursor: string | null;
}) {
  return (
    <ScrollLoadingList
      initialRows={initialRows}
      initialCursor={initialCursor}
      loadMore={loadMoreActivity}
      columns={[
        { id: "when", header: "When" },
        { id: "who", header: "Who", mobileFullWidth: true },
        { id: "action", header: "Action" },
        { id: "detail", header: "Detail", mobileFullWidth: true },
      ]}
      toRow={(a) => ({
        key: a.id,
        cells: [
          new Date(a.createdAt).toLocaleString(),
          a.actorEmail,
          a.action,
          <span key="d" className="muted">{a.detail ?? ""}</span>,
        ],
      })}
      emptyMessage="No changes recorded yet."
    />
  );
}
