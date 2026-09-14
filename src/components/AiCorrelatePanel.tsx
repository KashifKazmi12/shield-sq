"use client";

import { useState } from "react";
import { correlateAlert } from "@/app/(dashboard)/ai-actions";

type RelatedAlert = { id: string; title: string; detectedAt: string };
type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; related: RelatedAlert[]; summary: string | null }
  | { status: "error"; message: string };

export function AiCorrelatePanel({ findingId }: { findingId: string }) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function handleCorrelate() {
    setState({ status: "loading" });
    try {
      const result = await correlateAlert(findingId);
      setState({ status: "done", related: result.related, summary: result.summary });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "AI request failed" });
    }
  }

  if (state.status === "idle") {
    return (
      <button className="secondary" onClick={handleCorrelate}>
        🔗 Show related alerts
      </button>
    );
  }

  return (
    <div className="section">
      <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Related alerts</h4>
      {state.status === "loading" && <p className="muted">Looking…</p>}
      {state.status === "error" && (
        <p style={{ color: "var(--danger-fg)", fontSize: 13 }}>{state.message}</p>
      )}
      {state.status === "done" && (
        state.related.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>No other alerts on this resource within an hour.</p>
        ) : (
          <>
            {state.summary && <p className="drawer-prose">{state.summary}</p>}
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {state.related.map((r) => (
                <li key={r.id}>
                  {r.title} — <span className="muted">{new Date(r.detectedAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </>
        )
      )}
    </div>
  );
}
