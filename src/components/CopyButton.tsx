"use client";

import { useState } from "react";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — nothing to fall
      // back to; the value is still visible and selectable.
    }
  }

  return (
    <button type="button" className="secondary" onClick={handleCopy} style={{ fontSize: 12, padding: "3px 10px" }}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
