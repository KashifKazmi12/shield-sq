"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export type FilterField = {
  name: string;
  label: string;
  options: { value: string; label: string }[];
};

export function FilterBar({ fields }: { fields: FilterField[] }) {
  const router = useRouter();
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
    router.push(`${pathname}?${params.toString()}`);
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
          value={searchParams.get(field.name) ?? ""}
          onChange={(e) => onChange(field.name, e.target.value)}
        >
          <option value="">{field.label}: All</option>
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
