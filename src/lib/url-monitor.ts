import * as cheerio from "cheerio";
import { prisma } from "./prisma";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MAX_LINKS = 50;

export type HealthCheck = { statusCode: number | null; latencyMs: number | null };

// HEAD first (cheaper), falls back to GET only when HEAD produced a real
// response we can't use (405 Method Not Allowed / 501 Not Implemented) — a
// server that doesn't support HEAD at all. Deliberately does NOT retry with
// GET when HEAD returned no status at all (timeout/DNS/connection refused):
// that failure mode will almost always repeat identically on GET, so
// retrying would just wait a second full timeout for a truly-down site
// instead of reporting the outage after one.
export async function checkStatus(url: string, timeoutMs = 10_000): Promise<HealthCheck> {
  const head = await timedRequest(url, "HEAD", timeoutMs);
  if (head.statusCode === 405 || head.statusCode === 501) {
    return timedRequest(url, "GET", timeoutMs);
  }
  return head;
}

// Both methods follow redirects — a site that redirects http→https, or bare
// domain→www, is extremely common, and only checking the redirect hop's
// status (301/302) without following it would never confirm whether the
// real destination is actually reachable.
async function timedRequest(url: string, method: "GET" | "HEAD", timeoutMs: number): Promise<HealthCheck> {
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { statusCode: res.status, latencyMs: performance.now() - start };
  } catch {
    return { statusCode: null, latencyMs: null };
  }
}

// Runs `checkStatus` over every url with at most `concurrency` in flight at
// once — plain serial checking is fine for a handful of endpoints, but a
// 50-endpoint site (the discovery cap) would otherwise take 50x one
// request's latency end to end for no reason.
const HEALTH_CHECK_CONCURRENCY = 5;

async function checkStatusBatch(urls: string[]): Promise<HealthCheck[]> {
  const results: HealthCheck[] = new Array(urls.length);
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const i = next++;
      results[i] = await checkStatus(urls[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(HEALTH_CHECK_CONCURRENCY, urls.length) }, worker));
  return results;
}

// Fetches the page once and returns both its health check and its same-
// domain links, so callers never fetch the same URL more than once (the
// reference fetches a new site's root three separate times).
export async function fetchAndDiscoverLinks(pageUrl: string, timeoutMs = 10_000) {
  const start = performance.now();
  let statusCode: number | null = null;
  let html = "";
  try {
    const res = await fetch(pageUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    statusCode = res.status;
    html = await res.text();
  } catch {
    return { statusCode: null, latencyMs: null, links: [] as string[] };
  }
  const latencyMs = performance.now() - start;
  const links = extractSameDomainLinks(html, pageUrl);
  return { statusCode, latencyMs, links };
}

function stripWww(hostname: string) {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

export function extractSameDomainLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const baseHost = stripWww(base.hostname);
  const $ = cheerio.load(html);
  const found = new Set<string>();

  $("a[href]").each((_, el) => {
    if (found.size >= MAX_LINKS) return;
    const href = $(el).attr("href");
    if (!href) return;
    let resolved: URL;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      return;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return;
    if (stripWww(resolved.hostname) !== baseHost) return;
    resolved.hash = "";
    found.add(resolved.toString());
  });

  return Array.from(found);
}

export function deriveDomain(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

export function derivePath(url: string): string {
  const u = new URL(url);
  return u.pathname + u.search;
}

// One fetch of the site root, endpoint discovery from that same fetch, and
// a ScanResult written for the root + every discovered endpoint (health
// checks run with bounded concurrency, not one at a time). Used both by
// createSite (initial scan) and discoverEndpoints (manual re-discovery).
export async function discoverAndScanSite(siteId: string, url: string) {
  const { statusCode, latencyMs, links } = await fetchAndDiscoverLinks(url);

  const [, existing] = await Promise.all([
    prisma.siteScanResult.create({ data: { siteId, statusCode, latencyMs, endpointId: null } }),
    prisma.monitoredEndpoint.findMany({ where: { siteId, url: { in: links } }, select: { url: true } }),
  ]);
  const existingUrls = new Set(existing.map((e) => e.url));
  const newEndpointsFound = links.filter((l) => !existingUrls.has(l)).length;

  const endpoints = await Promise.all(
    links.map((link) =>
      prisma.monitoredEndpoint.upsert({
        where: { siteId_url: { siteId, url: link } },
        update: {},
        create: { siteId, url: link, path: derivePath(link) },
      })
    )
  );

  const healths = await checkStatusBatch(links);
  if (endpoints.length > 0) {
    await prisma.siteScanResult.createMany({
      data: endpoints.map((endpoint, i) => ({
        siteId,
        endpointId: endpoint.id,
        statusCode: healths[i].statusCode,
        latencyMs: healths[i].latencyMs,
      })),
    });
  }

  return { statusCode, latencyMs, linksFound: links.length, newEndpointsFound };
}

// Re-checks the site root and every already-known endpoint — no new
// discovery (that only happens at creation time or via discoverAndScanSite).
export async function rescanSite(siteId: string, url: string) {
  const [rootHealth, endpoints] = await Promise.all([
    checkStatus(url),
    prisma.monitoredEndpoint.findMany({ where: { siteId } }),
  ]);

  const healths = await checkStatusBatch(endpoints.map((e) => e.url));

  await prisma.siteScanResult.createMany({
    data: [
      { siteId, statusCode: rootHealth.statusCode, latencyMs: rootHealth.latencyMs, endpointId: null },
      ...endpoints.map((endpoint, i) => ({
        siteId,
        endpointId: endpoint.id,
        statusCode: healths[i].statusCode,
        latencyMs: healths[i].latencyMs,
      })),
    ],
  });
}
