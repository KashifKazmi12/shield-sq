"use client";

import { useState, useTransition } from "react";
import { changeOwnPassword } from "./actions";

export function ChangePasswordForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      try {
        await changeOwnPassword(currentPassword, newPassword);
        setCurrentPassword("");
        setNewPassword("");
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          onSuccess?.();
        }, 1200);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Current password</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          style={{ display: "block", width: "100%", maxWidth: 320 }}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>New password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="At least 8 characters"
          style={{ display: "block", width: "100%", maxWidth: 320 }}
        />
      </div>
      {error && <p style={{ color: "var(--danger-fg)", fontSize: 13 }}>{error}</p>}
      <button onClick={handleSubmit} disabled={isPending || !currentPassword || !newPassword}>
        {success ? "Password updated" : "Update password"}
      </button>
    </div>
  );
}
