"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "./actions";

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      try {
        const projectId = await createProject(name);
        setName("");
        router.push(`/settings?project=${projectId}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="toolbar">
      <input
        type="text"
        placeholder="e.g. Payments Service, or another repo/cluster"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button onClick={handleCreate} disabled={isPending || !name.trim()}>
        New project
      </button>
      {error && <span style={{ color: "var(--danger-fg)", fontSize: 13 }}>{error}</span>}
    </div>
  );
}
