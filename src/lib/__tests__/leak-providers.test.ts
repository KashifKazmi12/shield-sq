import { describe, it, expect } from "vitest";
import { maskSecret, computeSeverity, parseDate } from "../leak-providers";

describe("maskSecret", () => {
  it("masks a short value with a fixed-width placeholder", () => {
    expect(maskSecret("ab")).toBe("••••");
  });

  it("keeps first/last two characters for longer values", () => {
    expect(maskSecret("hunter2!")).toBe("hu••••••2!");
  });

  it("returns a placeholder for empty/non-string values", () => {
    expect(maskSecret(null)).toBe("••••••••");
    expect(maskSecret(undefined)).toBe("••••••••");
  });
});

describe("computeSeverity", () => {
  it("returns high when a password is present", () => {
    expect(computeSeverity({ password: "hunter2" })).toBe("high");
  });

  it("returns high when a hash is present", () => {
    expect(computeSeverity({ hash: "5f4dcc3b5aa765d61d8327deb882cf99" })).toBe("high");
  });

  it("returns medium for other PII without a credential", () => {
    expect(computeSeverity({ phone: "555-0100" })).toBe("medium");
    expect(computeSeverity({ database_name: "Acme Breach 2019" })).toBe("medium");
  });

  it("returns low for email/username only", () => {
    expect(computeSeverity({ email: "user@example.com" })).toBe("low");
  });
});

describe("parseDate", () => {
  it("parses a full ISO timestamp", () => {
    expect(parseDate("2015-03-01T00:00:00.000Z")?.getUTCFullYear()).toBe(2015);
  });

  it("parses a plain YYYY-MM-DD date", () => {
    expect(parseDate("2015-03-01")?.getUTCMonth()).toBe(2); // 0-indexed
  });

  it("parses LeakCheck's YYYY-MM (year-month only) format", () => {
    // Confirmed against a real LeakCheck response: source.breach_date is
    // "2015-03", not a full date — normalized to the 1st of that month.
    const parsed = parseDate("2015-03");
    expect(parsed).not.toBeNull();
    expect(parsed?.getUTCFullYear()).toBe(2015);
    expect(parsed?.getUTCMonth()).toBe(2);
    expect(parsed?.getUTCDate()).toBe(1);
  });

  it("returns null for missing or unrecognized values", () => {
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate("")).toBeNull();
    expect(parseDate("not a date")).toBeNull();
  });
});
