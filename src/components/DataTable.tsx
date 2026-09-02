"use client";

import type { ReactNode } from "react";

export type DataTableColumn = {
  id: string;
  header: string;
  /** Span both columns in the mobile card grid (good for long text / actions). */
  mobileFullWidth?: boolean;
  /** Hide the field label in the mobile card (e.g. action buttons). */
  mobileHideLabel?: boolean;
};

export type DataTableRow = {
  key: string;
  cells: ReactNode[];
};

type DataTableProps = {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  emptyMessage?: string;
  /** Fired with the row key when a row/card is clicked (client interactive tables). */
  onRowClick?: (key: string) => void;
};

/**
 * Shared table for desktop + card grid for small screens.
 * Mobile: each row is a card with a 2-column field grid inside.
 *
 * Rows pass pre-rendered `cells` (not render functions) so this works from
 * both Server Components and Client Components.
 */
export function DataTable({
  columns,
  rows,
  emptyMessage = "No rows.",
  onRowClick,
}: DataTableProps) {
  if (rows.length === 0) {
    return <p className="muted data-table-empty">{emptyMessage}</p>;
  }

  return (
    <div className="data-table">
      <div className="data-table-desktop-wrap">
        <table className="data-table-desktop">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.id}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                onClick={onRowClick ? () => onRowClick(row.key) : undefined}
                className={onRowClick ? "data-table-row-clickable" : undefined}
              >
                {columns.map((col, i) => (
                  <td key={col.id}>{row.cells[i]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="data-table-mobile" role="list">
        {rows.map((row) => (
          <article
            key={row.key}
            className={`data-table-card${onRowClick ? " data-table-row-clickable" : ""}`}
            role="listitem"
            onClick={onRowClick ? () => onRowClick(row.key) : undefined}
          >
            <div className="data-table-card-grid">
              {columns.map((col, i) => {
                const showLabel = !col.mobileHideLabel && Boolean(col.header);
                return (
                  <div
                    key={col.id}
                    className={`data-table-field${col.mobileFullWidth ? " full" : ""}`}
                  >
                    {showLabel && <div className="data-table-field-label">{col.header}</div>}
                    <div className="data-table-field-value">{row.cells[i]}</div>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
