import { describe, it, expect, vi, afterEach } from "vitest";
import { extractSameDomainLinks, deriveDomain, derivePath, checkStatus } from "../url-monitor";

describe("extractSameDomainLinks", () => {
  const html = `
    <html><body>
      <a href="/about">About</a>
      <a href="https://example.com/pricing">Pricing</a>
      <a href="https://www.example.com/blog">Blog (www variant)</a>
      <a href="https://other.com/evil">Off-site</a>
      <a href="mailto:hi@example.com">Email</a>
      <a href="#section">Same-page anchor</a>
      <a href="/about#top">About with fragment</a>
    </body></html>
  `;

  it("keeps only same-domain http(s) links, treating www as equivalent", () => {
    const links = extractSameDomainLinks(html, "https://example.com/");
    expect(links).toContain("https://example.com/about");
    expect(links).toContain("https://example.com/pricing");
    expect(links).toContain("https://www.example.com/blog");
    expect(links.some((l) => l.includes("other.com"))).toBe(false);
    expect(links.some((l) => l.startsWith("mailto:"))).toBe(false);
  });

  it("strips hash fragments and dedupes", () => {
    const links = extractSameDomainLinks(html, "https://example.com/");
    const aboutLinks = links.filter((l) => l.includes("/about"));
    expect(aboutLinks).toHaveLength(1);
    expect(aboutLinks[0]).not.toContain("#");
  });
});

describe("deriveDomain / derivePath", () => {
  it("extracts a lowercase hostname", () => {
    expect(deriveDomain("https://Example.COM/foo")).toBe("example.com");
  });

  it("extracts path + query", () => {
    expect(derivePath("https://example.com/blog/post?utm=1")).toBe("/blog/post?utm=1");
  });
});

describe("checkStatus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses HEAD's result directly when it succeeds (no GET fallback)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const result = await checkStatus("https://example.com");
    expect(result.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to GET when HEAD isn't supported (405/501)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 405 })
      .mockResolvedValueOnce({ status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const result = await checkStatus("https://example.com");
    expect(result.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry with GET when HEAD fails outright (no status at all)", async () => {
    // A real network failure (timeout/DNS/connection refused) will almost
    // certainly fail identically on GET too — retrying would just double
    // the wait for a truly-down site instead of reporting it sooner.
    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await checkStatus("https://example.com");
    expect(result.statusCode).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
