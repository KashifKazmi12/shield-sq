import { describe, it, expect } from "vitest";
import {
  parseTrivyPayload,
  trivyIdempotencyKey,
  trivyFindingDedupeKey,
  trivyDedupeKeyFromStoredFinding,
  extractTrivyFindings,
  TrivyPayloadError,
} from "../trivy";

const rawTrivyReport = {
  ArtifactName: "sample:latest",
  Results: [
    {
      Target: "sample:latest (alpine)",
      Vulnerabilities: [
        { VulnerabilityID: "CVE-1", PkgName: "openssl", Severity: "CRITICAL", FixedVersion: "1.2.3" },
        { VulnerabilityID: "CVE-2", PkgName: "libc", Severity: "LOW" },
      ],
    },
  ],
};

const wrapped = {
  meta: { repo: "org/app", branch: "main", commitSha: "abc123", pipelineId: "42" },
  results: rawTrivyReport,
};

describe("parseTrivyPayload", () => {
  it("accepts raw Trivy JSON output", () => {
    const parsed = parseTrivyPayload(rawTrivyReport);
    expect(parsed.meta).toEqual({});
    expect(parsed.report.Results?.length).toBe(1);
  });

  it("accepts the { meta, results } wrapper", () => {
    const parsed = parseTrivyPayload(wrapped);
    expect(parsed.meta.repo).toBe("org/app");
    expect(parsed.report.Results?.length).toBe(1);
  });

  it("rejects a payload with no Results field", () => {
    expect(() => parseTrivyPayload({ not: "trivy" })).toThrow(TrivyPayloadError);
  });

  it("rejects a payload with a malformed Results shape", () => {
    expect(() => parseTrivyPayload({ Results: "not-an-array" })).toThrow(TrivyPayloadError);
  });

  it("accepts a Results entry with Vulnerabilities: null (Trivy's shape for a clean target)", () => {
    const report = {
      Results: [
        { Target: "requirements.txt", Class: "lang-pkgs", Type: "python-pkg", Vulnerabilities: null },
        { Target: "app:latest", Vulnerabilities: [{ VulnerabilityID: "CVE-9", Severity: "HIGH" }] },
      ],
    };
    const parsed = parseTrivyPayload(report);
    expect(parsed.report.Results?.length).toBe(2);
    expect(extractTrivyFindings(parsed.report)).toHaveLength(1);
  });
});

describe("trivyIdempotencyKey", () => {
  it("is deterministic for the same (repo, commitSha, pipelineId)", () => {
    const parsed = parseTrivyPayload(wrapped);
    const key1 = trivyIdempotencyKey("project-1", parsed);
    const key2 = trivyIdempotencyKey("project-1", parsed);
    expect(key1).toBe(key2);
  });

  it("differs across projects for the same commit", () => {
    const parsed = parseTrivyPayload(wrapped);
    const keyA = trivyIdempotencyKey("project-a", parsed);
    const keyB = trivyIdempotencyKey("project-b", parsed);
    expect(keyA).not.toBe(keyB);
  });

  it("differs across pipeline runs of the same commit", () => {
    const parsed1 = parseTrivyPayload(wrapped);
    const parsed2 = parseTrivyPayload({ ...wrapped, meta: { ...wrapped.meta, pipelineId: "43" } });
    expect(trivyIdempotencyKey("project-1", parsed1)).not.toBe(trivyIdempotencyKey("project-1", parsed2));
  });

  it("falls back to a content hash when repo/commit metadata is missing", () => {
    const parsed = parseTrivyPayload(rawTrivyReport);
    const key1 = trivyIdempotencyKey("project-1", parsed);
    const key2 = trivyIdempotencyKey("project-1", parsed);
    expect(key1).toBe(key2);
    expect(key1).toContain("content:");
  });
});

describe("trivyFindingDedupeKey", () => {
  it("is stable for the same CVE + package + target", () => {
    expect(trivyFindingDedupeKey("CVE-1", "openssl", "app:latest")).toBe(
      trivyFindingDedupeKey("CVE-1", "openssl", "app:latest")
    );
  });

  it("differs when package or target differs", () => {
    expect(trivyFindingDedupeKey("CVE-1", "openssl", "a")).not.toBe(
      trivyFindingDedupeKey("CVE-1", "libc", "a")
    );
    expect(trivyFindingDedupeKey("CVE-1", "openssl", "a")).not.toBe(
      trivyFindingDedupeKey("CVE-1", "openssl", "b")
    );
  });
});

describe("trivyDedupeKeyFromStoredFinding", () => {
  it("rebuilds the same key from title + resource", () => {
    expect(trivyDedupeKeyFromStoredFinding("CVE-1 in openssl", "sample:latest (alpine)")).toBe(
      trivyFindingDedupeKey("CVE-1", "openssl", "sample:latest (alpine)")
    );
  });

  it("handles scoped package names and missing package", () => {
    expect(trivyDedupeKeyFromStoredFinding("CVE-1 in @sigstore/core", "Node.js")).toBe(
      "trivy:CVE-1:@sigstore/core:Node.js"
    );
    expect(trivyDedupeKeyFromStoredFinding("CVE-9", "app:latest")).toBe("trivy:CVE-9::app:latest");
  });
});

describe("extractTrivyFindings", () => {
  it("flattens vulnerabilities across all results and normalizes severity", () => {
    const parsed = parseTrivyPayload(rawTrivyReport);
    const findings = extractTrivyFindings(parsed.report);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      severity: "critical",
      title: "CVE-1 in openssl",
      fixedVersion: "1.2.3",
      resource: "sample:latest (alpine)",
      dedupeKey: "trivy:CVE-1:openssl:sample:latest (alpine)",
    });
    expect(findings[1]).toMatchObject({
      severity: "low",
      fixedVersion: null,
      dedupeKey: "trivy:CVE-2:libc:sample:latest (alpine)",
    });
  });

  it("returns an empty array for a report with no vulnerabilities", () => {
    const findings = extractTrivyFindings({ Results: [{ Target: "clean:latest", Vulnerabilities: [] }] });
    expect(findings).toEqual([]);
  });
});
