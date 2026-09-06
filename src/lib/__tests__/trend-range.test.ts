import { describe, it, expect } from "vitest";
import { resolveTrendWindow, eachUtcDay, formatIsoDate } from "../trend-range";

describe("resolveTrendWindow", () => {
  it("defaults to 7 days", () => {
    const w = resolveTrendWindow({});
    expect(w.range).toBe("7");
    expect(w.label).toBe("7 days");
  });

  it("accepts today and yesterday as single-day windows", () => {
    const today = resolveTrendWindow({ range: "today" });
    expect(today.range).toBe("today");
    expect(formatIsoDate(today.from)).toBe(formatIsoDate(today.to));

    const yesterday = resolveTrendWindow({ range: "yesterday" });
    expect(yesterday.range).toBe("yesterday");
    expect(formatIsoDate(yesterday.from)).toBe(formatIsoDate(yesterday.to));
    expect(formatIsoDate(yesterday.from) < formatIsoDate(today.from)).toBe(true);
  });

  it("accepts a custom inclusive range", () => {
    const w = resolveTrendWindow({ range: "custom", from: "2026-01-01", to: "2026-01-10" });
    expect(w.range).toBe("custom");
    expect(formatIsoDate(w.from)).toBe("2026-01-01");
    expect(formatIsoDate(w.to)).toBe("2026-01-10");
  });

  it("falls back from invalid custom to 7 days", () => {
    expect(resolveTrendWindow({ range: "custom", from: "bad", to: "2026-01-01" }).range).toBe("7");
  });

  it("falls back from removed presets to 7 days", () => {
    expect(resolveTrendWindow({ range: "30" }).range).toBe("7");
    expect(resolveTrendWindow({ range: "90" }).range).toBe("7");
  });
});

describe("eachUtcDay", () => {
  it("lists inclusive days", () => {
    const days = eachUtcDay(new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-03T00:00:00.000Z"));
    expect(days).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });
});
