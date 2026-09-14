"use client";

import { useCallback, useState, useTransition } from "react";
import { DataTable, type DataTableColumn, type DataTableRow } from "./DataTable";

const LOAD_MORE_THRESHOLD_PX = 48;

export function ScrollLoadingList<T>({
  initialRows,
  initialCursor,
  loadMore,
  columns,
  toRow,
  emptyMessage,
  maxHeight = 280,
}: {
  initialRows: T[];
  initialCursor: string | null;
  loadMore: (cursor: string) => Promise<{ rows: T[]; nextCursor: string | null }>;
  columns: DataTableColumn[];
  toRow: (item: T) => DataTableRow;
  emptyMessage?: string;
  maxHeight?: number;
}) {
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();

  const fetchMore = useCallback(() => {
    if (!cursor || isPending) return;
    startTransition(async () => {
      const result = await loadMore(cursor);
      setRows((prev) => [...prev, ...result.rows]);
      setCursor(result.nextCursor);
    });
  }, [cursor, isPending, loadMore]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - LOAD_MORE_THRESHOLD_PX) {
      fetchMore();
    }
  }

  return (
    <div style={{ maxHeight, overflowY: "auto" }} onScroll={handleScroll}>
      <DataTable columns={columns} rows={rows.map(toRow)} emptyMessage={emptyMessage} />
      {isPending && (
        <p className="muted" style={{ textAlign: "center", padding: 8, fontSize: 13 }}>
          Loading…
        </p>
      )}
    </div>
  );
}
