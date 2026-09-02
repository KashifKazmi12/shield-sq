"use client";

import { useEffect, useRef, type ReactNode } from "react";

type DrawerProps = {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

/**
 * Shared right-side detail drawer.
 * Sticky header keeps title + close icon visible while the body scrolls.
 */
export function Drawer({ open, title, onClose, children }: DrawerProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Details"}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-header">
          <h3 className="drawer-title">{title}</h3>
          <button
            type="button"
            className="drawer-close"
            aria-label="Close"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}
