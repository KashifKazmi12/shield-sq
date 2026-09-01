"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Polling-based "live" refresh — good enough for a low-volume alert feed
// without standing up SSE/WebSocket infra. See GAPS.md.
export function LiveRefreshToggle({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const [live, setLive] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [live, intervalMs, router]);

  return (
    <button className={live ? "" : "secondary"} onClick={() => setLive((v) => !v)}>
      {live ? "Live: on" : "Live: off"}
    </button>
  );
}
