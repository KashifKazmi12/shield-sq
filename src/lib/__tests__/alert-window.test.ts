import { describe, it, expect } from "vitest";
import { resolveAlertWindow, chartFromForWindow } from "../alert-window";

describe("resolveAlertWindow", () => {
  const now = new Date("2026-09-07T12:00:00.000Z");

  it("defaults to all time", () => {
    const w = resolveAlertWindow(undefined, now);
    expect(w.key).toBe("all");
    expect(w.from).toBeNull();
  });

  it("resolves short windows from a bare key", () => {
    expect(resolveAlertWindow("1m", now).from?.toISOString()).toBe("2026-09-07T11:59:00.000Z");
    expect(resolveAlertWindow("5m", now).from?.toISOString()).toBe("2026-09-07T11:55:00.000Z");
    expect(resolveAlertWindow("1h", now).from?.toISOString()).toBe("2026-09-07T11:00:00.000Z");
    expect(resolveAlertWindow("7d", now).from?.toISOString()).toBe("2026-08-31T12:00:00.000Z");
  });

  it("resolves all time with no lower bound", () => {
    const w = resolveAlertWindow({ window: "all" }, now);
    expect(w.key).toBe("all");
    expect(w.from).toBeNull();
  });

  it("resolves custom date range", () => {
    const w = resolveAlertWindow(
      { window: "custom", from: "2026-01-01", to: "2026-01-10" },
      now
    );
    expect(w.key).toBe("custom");
    expect(w.from?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(w.to?.toISOString()).toBe("2026-01-10T23:59:59.999Z");
    expect(w.label).toBe("2026-01-01 → 2026-01-10");
  });

  it("falls back to all time for invalid custom", () => {
    const w = resolveAlertWindow({ window: "custom", from: "bad", to: "2026-01-01" }, now);
    expect(w.key).toBe("all");
  });
});

describe("chartFromForWindow", () => {
  it("uses window.from when set", () => {
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-07T12:00:00.000Z");
    expect(chartFromForWindow({ key: "7d", label: "x", from, to })).toBe(from);
  });

  it("uses lookback when all-time", () => {
    const to = new Date("2026-09-07T12:00:00.000Z");
    const chartFrom = chartFromForWindow({ key: "all", label: "All time", from: null, to }, 90);
    expect(chartFrom.toISOString()).toBe("2026-06-09T12:00:00.000Z");
  });
});
