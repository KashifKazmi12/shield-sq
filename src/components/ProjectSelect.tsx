"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function ProjectSelect({ projects, currentId }: { projects: { id: string; name: string }[]; currentId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("project", id);
    // A cursor (or pagination history) from the previous project's result
    // set doesn't carry over — its id doesn't belong to this project's
    // rows, so keeping it would anchor the first page on the wrong place
    // instead of correctly starting from page 1.
    params.delete("cursor");
    params.delete("prevCursors");
    router.push(`${pathname}?${params.toString()}`);
  }

  if (projects.length <= 1) return null;

  return (
    <select value={currentId} onChange={(e) => onChange(e.target.value)}>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
