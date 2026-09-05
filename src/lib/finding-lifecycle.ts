export type FindingStatus = "opened" | "resolved" | "reopened";

export type OpenInterval = {
  start: string; // ISO
  end: string | null;
};

export function isOpenStatus(status: string): boolean {
  return status === "opened" || status === "reopened";
}

export function parseOpenIntervals(raw: unknown): OpenInterval[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const start = (item as { start?: unknown }).start;
      const end = (item as { end?: unknown }).end;
      if (typeof start !== "string") return null;
      return {
        start,
        end: typeof end === "string" ? end : null,
      } satisfies OpenInterval;
    })
    .filter((x): x is OpenInterval => x !== null);
}

export function initialOpenIntervals(at: Date = new Date()): OpenInterval[] {
  return [{ start: at.toISOString(), end: null }];
}

/** Close the current open interval (end was null). No-op if already closed. */
export function resolveOpenIntervals(intervals: OpenInterval[], at: Date = new Date()): OpenInterval[] {
  const next = intervals.map((i) => ({ ...i }));
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i].end === null) {
      next[i] = { ...next[i], end: at.toISOString() };
      break;
    }
  }
  return next;
}

/** Start a new open period after a resolve (reopen). */
export function reopenOpenIntervals(intervals: OpenInterval[], at: Date = new Date()): OpenInterval[] {
  const closed = resolveOpenIntervals(intervals, at);
  // If last was already closed, just append; if we just closed it above, append new open.
  const last = closed[closed.length - 1];
  if (last && last.end === null) return closed;
  return [...closed, { start: at.toISOString(), end: null }];
}

/** Total milliseconds the finding was actively open (excludes resolved gaps). */
export function computeOpenLifetimeMs(intervals: OpenInterval[], now: Date = new Date()): number {
  let total = 0;
  for (const interval of intervals) {
    const startMs = Date.parse(interval.start);
    if (Number.isNaN(startMs)) continue;
    const endMs = interval.end ? Date.parse(interval.end) : now.getTime();
    if (Number.isNaN(endMs) || endMs < startMs) continue;
    total += endMs - startMs;
  }
  return total;
}

/**
 * Compact relative duration (no seconds), common UI style:
 * 12m · 3h 20m · 2d 5h · 1w 3d · 2mo 1w · 1y 3mo
 */
export function formatLifetime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const minutesTotal = Math.floor(ms / 60_000);
  if (minutesTotal < 1) return "<1m";

  const minutes = minutesTotal % 60;
  const hoursTotal = Math.floor(minutesTotal / 60);
  const hours = hoursTotal % 24;
  const daysTotal = Math.floor(hoursTotal / 24);

  if (hoursTotal < 24) {
    if (hoursTotal < 1) return `${minutesTotal}m`;
    return minutes > 0 ? `${hoursTotal}h ${minutes}m` : `${hoursTotal}h`;
  }

  if (daysTotal < 7) {
    return hours > 0 ? `${daysTotal}d ${hours}h` : `${daysTotal}d`;
  }

  if (daysTotal < 30) {
    const weeks = Math.floor(daysTotal / 7);
    const days = daysTotal % 7;
    return days > 0 ? `${weeks}w ${days}d` : `${weeks}w`;
  }

  // Approximate months as 30d, years as 365d — good enough for a compact Age/Lifetime label.
  if (daysTotal < 365) {
    const months = Math.floor(daysTotal / 30);
    const remDays = daysTotal % 30;
    const weeks = Math.floor(remDays / 7);
    return weeks > 0 ? `${months}mo ${weeks}w` : `${months}mo`;
  }

  const years = Math.floor(daysTotal / 365);
  const remDays = daysTotal % 365;
  const months = Math.floor(remDays / 30);
  return months > 0 ? `${years}y ${months}mo` : `${years}y`;
}

export function formatFindingLifetime(intervalsRaw: unknown, now: Date = new Date()): string {
  return formatLifetime(computeOpenLifetimeMs(parseOpenIntervals(intervalsRaw), now));
}

export type LifecycleEvent = {
  type: "opened" | "resolved" | "reopened";
  at: string;
};

/** Timeline for the drawer, derived from openIntervals. */
export function lifecycleEventsFromIntervals(intervals: OpenInterval[]): LifecycleEvent[] {
  const events: LifecycleEvent[] = [];
  intervals.forEach((interval, index) => {
    events.push({
      type: index === 0 ? "opened" : "reopened",
      at: interval.start,
    });
    if (interval.end) {
      events.push({ type: "resolved", at: interval.end });
    }
  });
  return events;
}
