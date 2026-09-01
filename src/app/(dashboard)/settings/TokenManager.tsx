"use client";

import { useState, useTransition } from "react";
import { createIngestToken, revokeIngestToken } from "./actions";

type Token = {
  id: string;
  label: string | null;
  createdAt: Date | string;
  revokedAt: Date | string | null;
};

export function TokenManager({ projectId, tokens }: { projectId: string; tokens: Token[] }) {
  const [label, setLabel] = useState("");
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    startTransition(async () => {
      const token = await createIngestToken(projectId, label);
      setFreshToken(token);
      setLabel("");
    });
  }

  function handleRevoke(tokenId: string) {
    startTransition(async () => {
      await revokeIngestToken(tokenId);
    });
  }

  return (
    <div>
      {freshToken && (
        <div className="card" style={{ marginBottom: 12, borderColor: "var(--accent-emphasis)" }}>
          <strong>New ingest token (shown once — copy it now):</strong>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{freshToken}</pre>
          <button className="secondary" onClick={() => setFreshToken(null)}>Dismiss</button>
        </div>
      )}

      <div className="toolbar">
        <input
          type="text"
          placeholder="Label (e.g. github-actions-ci)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button onClick={handleCreate} disabled={isPending}>Create token</button>
      </div>

      <table>
        <thead>
          <tr><th>Label</th><th>Created</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {tokens.map((t) => (
            <tr key={t.id}>
              <td>{t.label ?? "—"}</td>
              <td>{new Date(t.createdAt).toLocaleString()}</td>
              <td>{t.revokedAt ? "revoked" : "active"}</td>
              <td>
                {!t.revokedAt && (
                  <button className="danger" onClick={() => handleRevoke(t.id)} disabled={isPending}>
                    Revoke
                  </button>
                )}
              </td>
            </tr>
          ))}
          {tokens.length === 0 && (
            <tr><td colSpan={4} className="muted">No tokens yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
