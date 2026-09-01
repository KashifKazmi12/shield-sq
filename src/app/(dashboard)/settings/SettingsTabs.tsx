"use client";

import { useState, type ReactNode } from "react";

type Tab = { key: string; label: string; node: ReactNode };

// Client-side only (no URL sync) — Settings subtabs are a within-page
// grouping, not a place worth deep-linking to yet. Server-rendered content
// for every tab is passed in already-rendered (see settings/page.tsx) and
// just toggled visible here, so switching tabs is instant with no refetch.
export function SettingsTabs({ tabs, defaultTab }: { tabs: Tab[]; defaultTab?: string }) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.key);

  return (
    <div>
      <div className="subtabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            className={`subtab${active === t.key ? " active" : ""}`}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} hidden={active !== t.key}>
          {t.node}
        </div>
      ))}
    </div>
  );
}
