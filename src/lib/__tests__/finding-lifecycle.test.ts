import { describe, it, expect } from "vitest";
import {
  computeOpenLifetimeMs,
  formatLifetime,
  initialOpenIntervals,
  lifecycleEventsFromIntervals,
  parseOpenIntervals,
  reopenOpenIntervals,
  resolveOpenIntervals,
} from "../finding-lifecycle";

describe("formatLifetime", () => {
  it("shows minutes under an hour", () => {
    expect(formatLifetime(5 * 60_000)).toBe("5m");
    expect(formatLifetime(30_000)).toBe("<1m");
  });

  it("shows hours and minutes under a day", () => {
    expect(formatLifetime(3 * 3_600_000 + 20 * 60_000)).toBe("3h 20m");
    expect(formatLifetime(2 * 3_600_000)).toBe("2h");
  });

  it("shows days/weeks/months/years compactly", () => {
    expect(formatLifetime(2 * 86_400_000 + 5 * 3_600_000)).toBe("2d 5h");
    expect(formatLifetime(10 * 86_400_000)).toBe("1w 3d");
    expect(formatLifetime(45 * 86_400_000)).toBe("1mo 2w");
    expect(formatLifetime(400 * 86_400_000)).toBe("1y 1mo");
  });
});

describe("open interval helpers", () => {
  it("sums only open periods for lifetime", () => {
    const intervals = [
      { start: "2026-01-01T00:00:00.000Z", end: "2026-01-01T01:00:00.000Z" }, // 1h
      { start: "2026-01-02T00:00:00.000Z", end: null }, // open 30m from now mock
    ];
    const now = new Date("2026-01-02T00:30:00.000Z");
    expect(computeOpenLifetimeMs(intervals, now)).toBe(90 * 60_000);
  });

  it("resolve then reopen appends a new open interval", () => {
    let intervals = initialOpenIntervals(new Date("2026-01-01T00:00:00.000Z"));
    intervals = resolveOpenIntervals(intervals, new Date("2026-01-01T02:00:00.000Z"));
    expect(intervals[0].end).toBe("2026-01-01T02:00:00.000Z");
    intervals = reopenOpenIntervals(intervals, new Date("2026-01-03T00:00:00.000Z"));
    expect(intervals).toHaveLength(2);
    expect(intervals[1].end).toBeNull();
    expect(lifecycleEventsFromIntervals(intervals).map((e) => e.type)).toEqual([
      "opened",
      "resolved",
      "reopened",
    ]);
  });

  it("parseOpenIntervals ignores junk", () => {
    expect(parseOpenIntervals([{ start: "x", end: null }, { bad: true }])).toEqual([
      { start: "x", end: null },
    ]);
  });
});
