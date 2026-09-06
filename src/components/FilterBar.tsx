"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { usePendingRouter } from "@/components/NavigationPending";

export type FilterField = {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  /** When set, used if the URL has no value for this field. */
  defaultValue?: string;
  /** Skip the empty "{label}: All" option (use when defaultValue covers the default). */
  hideAllOption?: boolean;
};

export function FilterBar({ fields }: { fields: FilterField[] }) {
  const { push, isPending } = usePendingRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    // Filter change resets pagination — a cursor (or a stack of previous
    // cursors) from the old result set doesn't mean anything once the
    // filtered rows underneath it have changed.
    params.delete("cursor");
    params.delete("prevCursors");
    push(`${pathname}?${params.toString()}`);
  }

  // No wrapping div here — the caller places FilterBar inside its own
  // .toolbar, whether alongside other filters (TextFilter) or alone. A
  // FilterBar-owned wrapper would nest one .toolbar's margin inside
  // another's flex row and throw off vertical alignment with siblings.
  return (
    <>
      {fields.map((field) => (
        <select
          key={field.name}
          value={searchParams.get(field.name) ?? field.defaultValue ?? ""}
          disabled={isPending}
          onChange={(e) => onChange(field.name, e.target.value)}
        >
          {!field.hideAllOption && <option value="">{field.label}: All</option>}
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ))}
    </>
  );
}
