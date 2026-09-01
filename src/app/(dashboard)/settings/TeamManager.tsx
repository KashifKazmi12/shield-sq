"use client";

import { useState, useTransition } from "react";
import { createTeammate, removeTeammate, resetTeammatePassword } from "./actions";
import { CopyButton } from "@/components/CopyButton";

type Teammate = {
  id: string;
  email: string;
  role: string;
  createdAt: Date | string;
};

export function TeamManager({ teammates, currentUserId }: { teammates: Teammate[]; currentUserId: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "viewer">("viewer");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);

  const [resetResult, setResetResult] = useState<{ email: string; tempPassword: string } | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createTeammate(email, role);
        setCreated(result);
        setEmail("");
        setRole("viewer");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function handleRemove(userId: string) {
    setRowError(null);
    startTransition(async () => {
      try {
        await removeTeammate(userId);
      } catch (err) {
        setRowError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function handleResetPassword(userId: string) {
    setRowError(null);
    startTransition(async () => {
      try {
        const result = await resetTeammatePassword(userId);
        setResetResult(result);
      } catch (err) {
        setRowError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div>
      {created && (
        <div className="card section" style={{ borderColor: "var(--attention-fg)", background: "var(--attention-subtle)" }}>
          <strong>&ldquo;{created.email}&rdquo; added — share these credentials with them:</strong>
          <p style={{ margin: "8px 0 2px", fontSize: 13, fontWeight: 600 }}>Temporary password</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <pre style={{ margin: 0, flex: 1 }}>{created.tempPassword}</pre>
            <CopyButton value={created.tempPassword} />
          </div>
          <button className="secondary" style={{ marginTop: 12 }} onClick={() => setCreated(null)}>
            Dismiss
          </button>
        </div>
      )}
      {resetResult && (
        <div className="card section" style={{ borderColor: "var(--attention-fg)", background: "var(--attention-subtle)" }}>
          <strong>Password reset for {resetResult.email} — share the new credentials:</strong>
          <p style={{ margin: "8px 0 2px", fontSize: 13, fontWeight: 600 }}>New temporary password</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <pre style={{ margin: 0, flex: 1 }}>{resetResult.tempPassword}</pre>
            <CopyButton value={resetResult.tempPassword} />
          </div>
          <button className="secondary" style={{ marginTop: 12 }} onClick={() => setResetResult(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="toolbar">
        <input
          type="email"
          placeholder="teammate@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "viewer")}>
          <option value="viewer">Viewer</option>
          <option value="admin">Admin</option>
        </select>
        <button onClick={handleCreate} disabled={isPending || !email}>
          Add teammate
        </button>
      </div>
      {error && <p style={{ color: "var(--danger-fg)", fontSize: 13 }}>{error}</p>}
      {rowError && <p style={{ color: "var(--danger-fg)", fontSize: 13 }}>{rowError}</p>}

      <table>
        <thead>
          <tr><th>Email</th><th>Role</th><th>Added</th><th></th></tr>
        </thead>
        <tbody>
          {teammates.map((t) => (
            <tr key={t.id}>
              <td>{t.email}</td>
              <td style={{ textTransform: "capitalize" }}>{t.role}</td>
              <td>{new Date(t.createdAt).toLocaleDateString()}</td>
              <td>
                {t.id === currentUserId ? (
                  <span className="muted">You</span>
                ) : (
                  <div className="toolbar" style={{ margin: 0 }}>
                    <button className="secondary" onClick={() => handleResetPassword(t.id)} disabled={isPending}>
                      Reset password
                    </button>
                    <button className="danger" onClick={() => handleRemove(t.id)} disabled={isPending}>
                      Remove
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
