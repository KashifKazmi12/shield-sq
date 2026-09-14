import { describe, it, expect } from "vitest";
import { computeLeakRiskLevel } from "../identity-risk";

describe("computeLeakRiskLevel", () => {
  it("is critical when any password was independently confirmed pwned", () => {
    expect(computeLeakRiskLevel({ highSeverityInWindow: 0, passwordsPwnedInWindow: 1, openDnsFindings: 0 })).toBe("critical");
  });

  it("is high when there's a high-severity breach but no confirmed-pwned password", () => {
    expect(computeLeakRiskLevel({ highSeverityInWindow: 2, passwordsPwnedInWindow: 0, openDnsFindings: 0 })).toBe("high");
  });

  it("is medium when only DNS gaps are open", () => {
    expect(computeLeakRiskLevel({ highSeverityInWindow: 0, passwordsPwnedInWindow: 0, openDnsFindings: 1 })).toBe("medium");
  });

  it("is low when nothing is flagged", () => {
    expect(computeLeakRiskLevel({ highSeverityInWindow: 0, passwordsPwnedInWindow: 0, openDnsFindings: 0 })).toBe("low");
  });

  it("prioritizes pwned password over high severity and DNS gaps", () => {
    expect(computeLeakRiskLevel({ highSeverityInWindow: 5, passwordsPwnedInWindow: 1, openDnsFindings: 3 })).toBe("critical");
  });
});
