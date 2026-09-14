import { describe, it, expect, vi } from "vitest";

const resolveTxtMock = vi.fn();
vi.mock("dns/promises", () => ({
  resolveTxt: (...args: unknown[]) => resolveTxtMock(...args),
}));

const { checkSpf, checkDmarc, checkDkim, domainFromEmail } = await import("../identity-dns-checks");

describe("domainFromEmail", () => {
  it("extracts the domain after the last @", () => {
    expect(domainFromEmail("user@example.com")).toBe("example.com");
  });

  it("returns null when there's no @", () => {
    expect(domainFromEmail("not-an-email")).toBeNull();
  });
});

describe("checkSpf", () => {
  it("returns no finding when a v=spf1 record exists", async () => {
    resolveTxtMock.mockResolvedValueOnce([["v=spf1 include:_spf.google.com ~all"]]);
    expect(await checkSpf("example.com")).toEqual([]);
  });

  it("flags a domain with no SPF record", async () => {
    resolveTxtMock.mockResolvedValueOnce([["some-other-txt-record"]]);
    const findings = await checkSpf("example.com");
    expect(findings).toEqual([expect.objectContaining({ type: "spf_missing", severity: "medium" })]);
  });

  it("treats a DNS lookup failure as 'no record found'", async () => {
    resolveTxtMock.mockImplementationOnce(async () => {
      throw new Error("ENODATA");
    });
    const findings = await checkSpf("example.com");
    expect(findings[0]?.type).toBe("spf_missing");
  });
});

describe("checkDmarc", () => {
  it("returns no finding for an enforcing DMARC policy", async () => {
    resolveTxtMock.mockResolvedValueOnce([["v=DMARC1; p=reject; rua=mailto:dmarc@example.com"]]);
    expect(await checkDmarc("example.com")).toEqual([]);
  });

  it("flags a missing DMARC record as high severity", async () => {
    resolveTxtMock.mockResolvedValueOnce([]);
    const findings = await checkDmarc("example.com");
    expect(findings).toEqual([expect.objectContaining({ type: "dmarc_missing", severity: "high", dedupeKey: "dmarc_missing" })]);
  });

  it("flags p=none as a lower-severity monitor-only gap, not a hard miss", async () => {
    resolveTxtMock.mockResolvedValueOnce([["v=DMARC1; p=none"]]);
    const findings = await checkDmarc("example.com");
    expect(findings).toEqual([expect.objectContaining({ severity: "low", dedupeKey: "dmarc_policy_none" })]);
  });
});

describe("checkDkim", () => {
  it("returns no finding when any common selector resolves", async () => {
    resolveTxtMock.mockImplementation(async (host: unknown) =>
      typeof host === "string" && host.startsWith("google._domainkey") ? [["v=DKIM1; k=rsa; p=ABC"]] : []
    );
    expect(await checkDkim("example.com")).toEqual([]);
    resolveTxtMock.mockReset();
  });

  it("flags (as low-confidence info) when no common selector resolves", async () => {
    resolveTxtMock.mockImplementation(async () => []);
    const findings = await checkDkim("example.com");
    expect(findings).toEqual([expect.objectContaining({ type: "dkim_missing", severity: "info" })]);
    resolveTxtMock.mockReset();
  });
});
