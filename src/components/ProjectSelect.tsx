"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePendingRouter } from "@/components/NavigationPending";

export function ProjectSelect({
  projects,
  currentId,
  defaultId,
}: {
  projects: { id: string; name: string }[];
  /** Resolved project currently driving the page (matches resolveProject). */
  currentId?: string;
  /** Fallback when the URL has no ?project= — oldest project, same as resolveProject. */
  defaultId?: string;
}) {
  const router = useRouter();
  const { push, isPending } = usePendingRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const paramId = searchParams.get("project");
  const selectedId =
    (paramId && projects.some((p) => p.id === paramId) && paramId) ||
    currentId ||
    defaultId ||
    projects[0]?.id ||
    "";
  const selected = projects.find((p) => p.id === selectedId) ?? projects[0];

  // Keep ?project= in the URL so sidebar links and page queries stay aligned
  // with the topbar selection (and with resolveProject's default).
  useEffect(() => {
    if (!defaultId || projects.length === 0) return;
    if (searchParams.get("project")) return;
    if (!projects.some((p) => p.id === defaultId)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("project", defaultId);
    // Initial URL sync — use the bare router so first paint doesn't flash
    // the pending skeleton overlay.
    router.replace(`${pathname}?${params.toString()}`);
  }, [defaultId, pathname, projects, router, searchParams]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function onChange(id: string) {
    setOpen(false);
    if (id === selectedId || isPending) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("project", id);
    // A cursor (or pagination history) from the previous project's result
    // set doesn't carry over — its id doesn't belong to this project's
    // rows, so keeping it would anchor the first page on the wrong place
    // instead of correctly starting from page 1.
    params.delete("cursor");
    params.delete("prevCursors");
    push(`${pathname}?${params.toString()}`);
  }

  if (projects.length <= 1 || !selected) return null;

  return (
    <div className={`project-menu${isPending ? " is-pending" : ""}`} ref={menuRef}>
      <button
        type="button"
        className="project-menu-trigger"
        aria-label="Project"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-busy={isPending}
        disabled={isPending}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="project-menu-label">Project</span>
        <span className="project-menu-value">{selected.name}</span>
        <svg className="project-menu-caret" width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M4.427 6.427 8 10l3.573-3.573a.25.25 0 0 1 .354.354l-3.75 3.75a.25.25 0 0 1-.354 0l-3.75-3.75a.25.25 0 0 1 .354-.354Z" />
        </svg>
      </button>
      {open && (
        <div className="project-menu-dropdown" role="listbox" aria-label="Projects">
          {projects.map((p) => {
            const isSelected = p.id === selected.id;
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`project-menu-item${isSelected ? " selected" : ""}`}
                onClick={() => onChange(p.id)}
              >
                <span className="project-menu-item-name">{p.name}</span>
                {isSelected && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
