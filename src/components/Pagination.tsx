"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { usePendingRouter } from "@/components/NavigationPending";

const CURSOR_PARAM = "cursor";
const HISTORY_PARAM = "prevCursors";

type Props = {
  /** Cursor to fetch the next page, or null if this is the last page. */
  nextCursor: string | null;
  /** Number of items actually returned for the current page (for the range text). */
  pageCount: number;
  /** Total matching rows across every page, ignoring pagination. */
  total: number;
  /** Page size, used to compute the shown range and page count. */
  take: number;
};

// Cursor pagination has no cheap "jump to page N," but a real Previous
// button doesn't need one — it just needs to retrace the cursors used to
// get here. `prevCursors` in the URL is a comma-joined stack of those
// cursors, one per page already visited (page 1's cursor is the empty
// string, since "no cursor" can't itself be joined into the list) — so
// Previous/First survive a shared link or a refresh, unlike relying on the
// browser's own back button.
export function Pagination({ nextCursor, pageCount, total, take }: Props) {
  const { push, isPending } = usePendingRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawHistory = searchParams.get(HISTORY_PARAM);
  const history = rawHistory === null ? [] : rawHistory.split(",");
  const currentCursor = searchParams.get(CURSOR_PARAM);

  const pageNumber = history.length + 1;
  const totalPages = total > 0 ? Math.ceil(total / take) : 1;
  const rangeStart = total === 0 ? 0 : (pageNumber - 1) * take + 1;
  const rangeEnd = (pageNumber - 1) * take + pageCount;
  const hasPrev = history.length > 0;

  function navigate(cursor: string | null, newHistory: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (cursor) params.set(CURSOR_PARAM, cursor);
    else params.delete(CURSOR_PARAM);
    if (newHistory.length) params.set(HISTORY_PARAM, newHistory.join(","));
    else params.delete(HISTORY_PARAM);
    push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function goFirst() {
    navigate(null, []);
  }

  function goPrev() {
    if (!hasPrev) return;
    const newHistory = history.slice(0, -1);
    const restored = history[history.length - 1];
    navigate(restored === "" ? null : restored, newHistory);
  }

  function goNext() {
    if (!nextCursor) return;
    navigate(nextCursor, [...history, currentCursor ?? ""]);
  }

  return (
    <div className="pagination">
      <span className="pagination-range">
        {total === 0 ? "No results" : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
      </span>
      <div className="pagination-controls">
        <button
          type="button"
          className="secondary pagination-btn"
          onClick={goFirst}
          disabled={!hasPrev || isPending}
          aria-label="First page"
          title="First page"
        >
          «
        </button>
        <button
          type="button"
          className="secondary pagination-btn"
          onClick={goPrev}
          disabled={!hasPrev || isPending}
          aria-label="Previous page"
        >
          ‹ Prev
        </button>
        <span className="pagination-page">
          Page {pageNumber}{total > 0 ? ` of ${totalPages}` : ""}
        </span>
        <button
          type="button"
          className="pagination-btn"
          onClick={goNext}
          disabled={!nextCursor || isPending}
          aria-label="Next page"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
