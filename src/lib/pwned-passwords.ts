import { createHash } from "crypto";

// HaveIBeenPwned's Pwned Passwords API — k-anonymity range query, free,
// keyless (unlike HIBP's breach-search-by-email API, which requires a paid
// key). Only the first 5 hex characters of a SHA-1 hash are ever sent; the
// full password/hash never leaves this process. See
// https://haveibeenpwned.com/API/v3#PwnedPasswords
const RANGE_API = "https://api.pwnedpasswords.com/range/";

export type PwnedPasswordResult = { pwned: boolean; count: number };

export async function checkPasswordPwned(password: string, timeoutMs = 8_000): Promise<PwnedPasswordResult | null> {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const res = await fetch(`${RANGE_API}${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null; // API down/rate-limited — treat as "unknown", not "not pwned"

    const body = await res.text();
    for (const line of body.split("\n")) {
      const [candidateSuffix, countStr] = line.trim().split(":");
      if (candidateSuffix === suffix) {
        return { pwned: true, count: Number(countStr) || 0 };
      }
    }
    return { pwned: false, count: 0 };
  } catch {
    return null; // network error/timeout — same "unknown" treatment as a non-OK response
  }
}
