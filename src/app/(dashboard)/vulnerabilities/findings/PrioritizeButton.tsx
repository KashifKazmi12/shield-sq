"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triagePriority } from "@/app/(dashboard)/ai-actions";

export function PrioritizeButton({ projectId }: { projectId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await triagePriority(projectId);
        setMessage(`Scored ${result.updated} open finding${result.updated === 1 ? "" : "s"}.`);
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Prioritization failed");
      }
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button className="secondary" onClick={handleClick} disabled={isPending}>
        {isPending ? "Prioritizing…" : "✨ Prioritize with AI"}
      </button>
      {message && <span className="muted" style={{ fontSize: 13 }}>{message}</span>}
    </div>
  );
}
