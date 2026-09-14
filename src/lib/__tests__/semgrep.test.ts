import { describe, it, expect } from "vitest";
import { parseSemgrepPayload, extractSemgrepFindings, semgrepDedupeKey, SemgrepPayloadError } from "../semgrep";

const rawReport = {
  results: [
    {
      check_id: "python.lang.security.audit.eval-detected",
      path: "app/main.py",
      start: { line: 42 },
      end: { line: 42 },
      extra: { severity: "ERROR", message: "Detected use of eval()" },
    },
  ],
};

describe("parseSemgrepPayload", () => {
  it("accepts raw semgrep --json output", () => {
    const parsed = parseSemgrepPayload(rawReport);
    expect(parsed.meta).toEqual({});
    expect(parsed.report.results).toHaveLength(1);
  });

  it("accepts the { meta, results } wrapper", () => {
    const wrapped = { meta: { repo: "org/app", commitSha: "abc" }, results: rawReport };
    const parsed = parseSemgrepPayload(wrapped);
    expect(parsed.meta.repo).toBe("org/app");
  });

  it("rejects a payload with no results field", () => {
    expect(() => parseSemgrepPayload({ not: "semgrep" })).toThrow(SemgrepPayloadError);
  });
});

describe("extractSemgrepFindings", () => {
  it("maps ERROR to high and WARNING to medium", () => {
    const findings = extractSemgrepFindings(rawReport);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: "high",
      title: "python.lang.security.audit.eval-detected",
      ruleName: "python.lang.security.audit.eval-detected",
      resource: "app/main.py:42",
      dedupeKey: semgrepDedupeKey("python.lang.security.audit.eval-detected", "app/main.py", 42),
    });
  });
});
