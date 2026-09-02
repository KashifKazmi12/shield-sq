"use client";

import { useState, useTransition } from "react";
import { DataTable } from "@/components/DataTable";
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

      <DataTable
        columns={[
          { id: "label", header: "Label" },
          { id: "created", header: "Created", mobileFullWidth: true },
          { id: "status", header: "Status" },
          { id: "actions", header: "", mobileFullWidth: true, mobileHideLabel: true },
        ]}
        rows={tokens.map((t) => ({
          key: t.id,
          cells: [
            t.label ?? "—",
            new Date(t.createdAt).toLocaleString(),
            t.revokedAt ? "revoked" : "active",
            !t.revokedAt ? (
              <button key="r" className="danger" onClick={() => handleRevoke(t.id)} disabled={isPending}>
                Revoke
              </button>
            ) : null,
          ],
        }))}
        emptyMessage="No tokens yet."
      />
    </div>
  );
}
