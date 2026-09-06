"use client";

import { useState, useTransition } from "react";
import { DataTable } from "@/components/DataTable";
import { createIngestToken, renameIngestToken, revokeIngestToken } from "./actions";

type Token = {
  id: string;
  label: string | null;
  createdAt: Date | string;
  revokedAt: Date | string | null;
};

type PendingAction =
  | { type: "create" }
  | { type: "save"; tokenId: string }
  | { type: "revoke"; tokenId: string }
  | null;

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.752.453l-3.217 1.007a.75.75 0 0 1-.927-.928l1.007-3.217c.089-.282.243-.542.453-.752ZM12.3 2.653a.25.25 0 0 0-.354 0L10.38 4.219l1.4 1.4 1.566-1.566a.25.25 0 0 0 0-.354Zm-2.095 2.74L5.423 10.176a.25.25 0 0 0-.065.108l-.558 1.784 1.784-.558a.25.25 0 0 0 .108-.065l4.782-4.782Z" />
    </svg>
  );
}

function ButtonSpinner({ tone = "on-primary" }: { tone?: "on-primary" | "on-muted" }) {
  return <span className={`btn-spinner${tone === "on-muted" ? " btn-spinner-muted" : ""}`} aria-hidden="true" />;
}

export function TokenManager({ projectId, tokens }: { projectId: string; tokens: Token[] }) {
  const [label, setLabel] = useState("");
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [pending, setPending] = useState<PendingAction>(null);
  const [, startTransition] = useTransition();

  function handleCreate() {
    setPending({ type: "create" });
    startTransition(async () => {
      try {
        const token = await createIngestToken(projectId, label);
        setFreshToken(token);
        setLabel("");
      } finally {
        setPending(null);
      }
    });
  }

  function handleRevoke(tokenId: string) {
    setPending({ type: "revoke", tokenId });
    startTransition(async () => {
      try {
        await revokeIngestToken(tokenId);
      } finally {
        setPending(null);
      }
    });
  }

  function startEdit(token: Token) {
    setEditingId(token.id);
    setEditLabel(token.label ?? "");
  }

  function cancelEdit() {
    if (pending) return;
    setEditingId(null);
    setEditLabel("");
  }

  function saveEdit(tokenId: string) {
    setPending({ type: "save", tokenId });
    startTransition(async () => {
      try {
        await renameIngestToken(tokenId, editLabel);
        setEditingId(null);
        setEditLabel("");
      } finally {
        setPending(null);
      }
    });
  }

  const busy = pending !== null;

  return (
    <div>
      {freshToken && (
        <div className="card" style={{ marginBottom: 12, borderColor: "var(--accent-emphasis)" }}>
          <strong>New ingest token (shown once — copy it now):</strong>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{freshToken}</pre>
          <button className="secondary" onClick={() => setFreshToken(null)}>
            Dismiss
          </button>
        </div>
      )}

      <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
        Use one ingest token per repo.
      </p>
      <div className="toolbar">
        <input
          type="text"
          placeholder="Label (e.g. github-actions-ci)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={busy}
        />
        <button onClick={handleCreate} disabled={busy}>
          {pending?.type === "create" ? (
            <>
              <ButtonSpinner />
              Creating…
            </>
          ) : (
            "Create token"
          )}
        </button>
      </div>

      <DataTable
        columns={[
          { id: "label", header: "Label", mobileFullWidth: true },
          { id: "created", header: "Created", mobileFullWidth: true },
          { id: "status", header: "Status" },
          { id: "actions", header: "", mobileFullWidth: true, mobileHideLabel: true },
        ]}
        rows={tokens.map((t) => {
          const saving = pending?.type === "save" && pending.tokenId === t.id;
          const revoking = pending?.type === "revoke" && pending.tokenId === t.id;

          return {
            key: t.id,
            cells: [
              editingId === t.id ? (
                <div key="edit" className="token-label-edit">
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    disabled={busy}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(t.id);
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                  <button type="button" onClick={() => saveEdit(t.id)} disabled={busy}>
                    {saving ? (
                      <>
                        <ButtonSpinner />
                        Saving…
                      </>
                    ) : (
                      "Save"
                    )}
                  </button>
                  <button type="button" className="secondary" onClick={cancelEdit} disabled={busy}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div key="label" className="token-label-cell">
                  <span>{t.label ?? "—"}</span>
                  <button
                    type="button"
                    className="secondary token-label-edit-btn"
                    aria-label={`Rename token${t.label ? ` ${t.label}` : ""}`}
                    title="Rename"
                    disabled={busy}
                    onClick={() => startEdit(t)}
                  >
                    <PencilIcon />
                  </button>
                </div>
              ),
              new Date(t.createdAt).toLocaleString(),
              t.revokedAt ? "revoked" : "active",
              !t.revokedAt ? (
                <button
                  key="r"
                  className="danger"
                  onClick={() => handleRevoke(t.id)}
                  disabled={busy}
                >
                  {revoking ? (
                    <>
                      <ButtonSpinner tone="on-muted" />
                      Revoking…
                    </>
                  ) : (
                    "Revoke"
                  )}
                </button>
              ) : null,
            ],
          };
        })}
        emptyMessage="No tokens yet."
      />
    </div>
  );
}
