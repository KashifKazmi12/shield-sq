import { describe, it, expect, vi, afterEach } from "vitest";
import { checkRateLimit } from "../rate-limit";
import { INGEST_RATE_LIMIT_PER_MINUTE } from "../constants";

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows requests under the per-minute limit", () => {
    const key = `test-${Math.random()}`;
    const result = checkRateLimit(key);
    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("blocks once the limit is exceeded and reports a positive retryAfterSeconds", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < INGEST_RATE_LIMIT_PER_MINUTE; i++) {
      expect(checkRateLimit(key).allowed).toBe(true);
    }
    const blocked = checkRateLimit(key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("resets after the window elapses", () => {
    vi.useFakeTimers();
    const key = `test-${Math.random()}`;
    for (let i = 0; i < INGEST_RATE_LIMIT_PER_MINUTE; i++) {
      checkRateLimit(key);
    }
    expect(checkRateLimit(key).allowed).toBe(false);

    vi.advanceTimersByTime(61_000);
    const afterWindow = checkRateLimit(key);
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.retryAfterSeconds).toBe(0);
  });

  it("tracks separate keys independently", () => {
    const keyA = `test-a-${Math.random()}`;
    const keyB = `test-b-${Math.random()}`;
    for (let i = 0; i < INGEST_RATE_LIMIT_PER_MINUTE; i++) {
      checkRateLimit(keyA);
    }
    expect(checkRateLimit(keyA).allowed).toBe(false);
    expect(checkRateLimit(keyB).allowed).toBe(true);
  });
});
