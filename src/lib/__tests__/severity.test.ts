import { describe, it, expect } from "vitest";
import { normalizeTrivySeverity, normalizeFalcoPriority, severityMeetsThreshold, severityRank } from "../severity";

describe("normalizeTrivySeverity", () => {
  it("maps known Trivy severities", () => {
    expect(normalizeTrivySeverity("CRITICAL")).toBe("critical");
    expect(normalizeTrivySeverity("high")).toBe("high");
  });

  it("falls back to info for unknown/missing severity", () => {
    expect(normalizeTrivySeverity("UNKNOWN")).toBe("info");
    expect(normalizeTrivySeverity(undefined)).toBe("info");
  });
});

describe("normalizeFalcoPriority", () => {
  it("maps Falco priorities to the shared severity scale", () => {
    expect(normalizeFalcoPriority("Emergency")).toBe("critical");
    expect(normalizeFalcoPriority("Error")).toBe("high");
    expect(normalizeFalcoPriority("Warning")).toBe("medium");
    expect(normalizeFalcoPriority("Notice")).toBe("low");
  });

  it("falls back to info for unrecognized priorities", () => {
    expect(normalizeFalcoPriority("Debug")).toBe("info");
    expect(normalizeFalcoPriority(undefined)).toBe("info");
  });
});

describe("severityMeetsThreshold", () => {
  it("treats a more severe finding as meeting a lower threshold", () => {
    expect(severityMeetsThreshold("critical", "high")).toBe(true);
  });

  it("treats a less severe finding as not meeting a higher threshold", () => {
    expect(severityMeetsThreshold("low", "critical")).toBe(false);
  });

  it("treats equal severity as meeting the threshold", () => {
    expect(severityMeetsThreshold("high", "high")).toBe(true);
  });
});

describe("severityRank", () => {
  it("orders critical before high before medium before low before info", () => {
    const ranks = ["critical", "high", "medium", "low", "info"].map(severityRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});
