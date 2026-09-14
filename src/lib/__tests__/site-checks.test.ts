import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveCaaMock = vi.fn();
vi.mock("dns/promises", () => ({
  resolveCaa: (...args: unknown[]) => resolveCaaMock(...args),
}));

const { checkCaaRecords } = await import("../site-checks");

describe("checkCaaRecords", () => {
  beforeEach(() => {
    resolveCaaMock.mockReset();
  });

  it("returns no finding when CAA records exist", async () => {
    resolveCaaMock.mockResolvedValue([{ critical: 0, issue: "letsencrypt.org" }]);
    const findings = await checkCaaRecords("example.com");
    expect(findings).toEqual([]);
  });

  it("flags a domain with an empty CAA result", async () => {
    resolveCaaMock.mockResolvedValue([]);
    const findings = await checkCaaRecords("example.com");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ type: "caa_record", severity: "low", dedupeKey: "caa_record:missing" });
  });

  it("treats ENODATA as 'no CAA record', not a check failure", async () => {
    resolveCaaMock.mockRejectedValue(Object.assign(new Error("no data"), { code: "ENODATA" }));
    const findings = await checkCaaRecords("example.com");
    expect(findings[0]?.dedupeKey).toBe("caa_record:missing");
  });

  it("swallows an unrelated DNS error without producing a finding", async () => {
    resolveCaaMock.mockRejectedValue(Object.assign(new Error("timeout"), { code: "ETIMEOUT" }));
    const findings = await checkCaaRecords("example.com");
    expect(findings).toEqual([]);
  });
});
