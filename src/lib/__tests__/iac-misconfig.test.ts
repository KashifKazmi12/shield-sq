import { describe, it, expect } from "vitest";
import { parseIacMisconfigPayload, extractIacMisconfigFindings, IacMisconfigPayloadError } from "../iac-misconfig";

const trivyReport = {
  Results: [
    {
      Target: "main.tf",
      Misconfigurations: [
        { ID: "AVD-AWS-0001", Title: "S3 bucket is public", Severity: "CRITICAL" },
      ],
    },
  ],
};

const checkovReport = {
  results: {
    failed_checks: [
      { check_id: "CKV_AWS_20", check_name: "S3 bucket has versioning disabled", file_path: "main.tf", file_line_range: [10, 15] },
    ],
  },
};

describe("parseIacMisconfigPayload", () => {
  it("accepts trivy config JSON output", () => {
    const parsed = parseIacMisconfigPayload(trivyReport);
    expect(parsed.report.kind).toBe("trivy");
  });

  it("accepts checkov JSON output", () => {
    const parsed = parseIacMisconfigPayload(checkovReport);
    expect(parsed.report.kind).toBe("checkov");
  });

  it("rejects an unrecognized shape", () => {
    expect(() => parseIacMisconfigPayload({ nope: true })).toThrow(IacMisconfigPayloadError);
  });
});

describe("extractIacMisconfigFindings", () => {
  it("maps trivy misconfigurations with CRITICAL severity", () => {
    const parsed = parseIacMisconfigPayload(trivyReport);
    const findings = extractIacMisconfigFindings(parsed.report);
    expect(findings).toEqual([
      expect.objectContaining({ severity: "critical", ruleName: "AVD-AWS-0001", resource: "main.tf" }),
    ]);
  });

  it("maps checkov failed checks to medium severity", () => {
    const parsed = parseIacMisconfigPayload(checkovReport);
    const findings = extractIacMisconfigFindings(parsed.report);
    expect(findings).toEqual([
      expect.objectContaining({ severity: "medium", ruleName: "CKV_AWS_20", resource: "main.tf:10" }),
    ]);
  });
});
