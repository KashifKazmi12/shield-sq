import { INGEST_RATE_LIMIT_PER_MINUTE } from "./constants";

// In-memory fixed-window limiter, keyed per ingest token. Single-process only —
// fine for local dev / single-instance deploys; swap for a shared store (Redis)
// if this ever runs behind multiple app instances.
const windows = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const windowMs = 60_000;
  const entry = windows.get(key);

  if (!entry || now >= entry.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: INGEST_RATE_LIMIT_PER_MINUTE - 1, retryAfterSeconds: 0 };
  }

  if (entry.count >= INGEST_RATE_LIMIT_PER_MINUTE) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count += 1;
  return { allowed: true, remaining: INGEST_RATE_LIMIT_PER_MINUTE - entry.count, retryAfterSeconds: 0 };
}
