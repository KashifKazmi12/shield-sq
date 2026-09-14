import { describe, it, expect } from "vitest";
import { parseGitleaksPayload, extractGitleaksFindings, GitleaksPayloadError } from "../gitleaks";

const rawReport = [
  { RuleID: "aws-access-key", File: "config/prod.yml", StartLine: 12, Secret: "AKIAABCDEFGHIJKLMNOP" },
];

describe("parseGitleaksPayload", () => {
  it("accepts a raw gitleaks JSON array", () => {
    const parsed = parseGitleaksPayload(rawReport);
    expect(parsed.report).toHaveLength(1);
  });

  it("accepts the { meta, results } wrapper", () => {
    const parsed = parseGitleaksPayload({ meta: { repo: "org/app" }, results: rawReport });
    expect(parsed.meta.repo).toBe("org/app");
  });

  it("rejects a non-array, non-wrapper payload", () => {
    expect(() => parseGitleaksPayload({ foo: "bar" })).toThrow(GitleaksPayloadError);
  });
});

describe("extractGitleaksFindings", () => {
  it("never includes the raw secret value in the finding", () => {
    const parsed = parseGitleaksPayload(rawReport);
    const findings = extractGitleaksFindings(parsed.report);
    expect(findings).toHaveLength(1);
    const serialized = JSON.stringify(findings[0]);
    expect(serialized).not.toContain("AKIAABCDEFGHIJKLMNOP");
    expect(findings[0]).toMatchObject({ severity: "high", ruleName: "aws-access-key", resource: "config/prod.yml:12" });
  });

  it("produces a stable dedupe key for the same entry", () => {
    const parsed = parseGitleaksPayload(rawReport);
    const a = extractGitleaksFindings(parsed.report)[0].dedupeKey;
    const b = extractGitleaksFindings(parsed.report)[0].dedupeKey;
    expect(a).toBe(b);
  });
});
