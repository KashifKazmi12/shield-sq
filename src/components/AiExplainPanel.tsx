"use client";

import { useState } from "react";
import { explainFinding } from "@/app/(dashboard)/ai-actions";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; content: string }
  | { status: "error"; message: string };

// Shared by TrivyFindingsTable and FalcoFeed's drawers — pass `key={findingId}`
// from the caller so switching the selected finding resets this panel's
// local state instead of showing the previous finding's explanation.
export function AiExplainPanel({ findingId }: { findingId: string }) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function handleExplain(regenerate: boolean) {
    setState({ status: "loading" });
    try {
      const result = await explainFinding(findingId, { regenerate });
      setState({ status: "done", content: result.content });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "AI request failed" });
    }
  }

  if (state.status === "idle") {
    return (
      <button className="secondary" onClick={() => handleExplain(false)}>
        ✨ Explain this finding
      </button>
    );
  }

  return (
    <div className="section">
      <div className="toolbar" style={{ justifyContent: "space-between", margin: 0 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>AI Explanation</h4>
        {state.status !== "loading" && (
          <button className="secondary" onClick={() => handleExplain(true)}>
            Regenerate
          </button>
        )}
      </div>
      {state.status === "loading" && <p className="muted">Thinking…</p>}
      {state.status === "done" && <p className="drawer-prose">{state.content}</p>}
      {state.status === "error" && (
        <p style={{ color: "var(--danger-fg)", fontSize: 13 }}>{state.message}</p>
      )}
    </div>
  );
}
