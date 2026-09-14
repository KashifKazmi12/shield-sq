import { createHash } from "crypto";
import { connect as tlsConnect, type PeerCertificate } from "tls";
import { resolveCaa } from "dns/promises";
import { prisma } from "./prisma";

export type SiteFindingInput = {
  type: "ssl_cert" | "caa_record" | "subdomain";
  severity: string;
  title: string;
  description: string | null;
  dedupeKey: string;
};

// --- SSL/TLS Certificate Monitor --------------------------------------------

const CERT_EXPIRY_WARNING_DAYS = 30;

function getPeerCertificate(hostname: string, timeoutMs = 10_000): Promise<PeerCertificate | null> {
  return new Promise((resolve) => {
    const socket = tlsConnect(
      { host: hostname, port: 443, servername: hostname, timeout: timeoutMs },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        resolve(Object.keys(cert).length ? cert : null);
      }
    );
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(null);
    });
  });
}

export async function checkSslCertificate(domain: string): Promise<SiteFindingInput[]> {
  const cert = await getPeerCertificate(domain);
  if (!cert) {
    return [
      {
        type: "ssl_cert",
        severity: "critical",
        title: "TLS handshake failed",
        description: `Could not retrieve a certificate from ${domain}:443`,
        dedupeKey: "ssl_cert:handshake_failed",
      },
    ];
  }

  const validTo = new Date(cert.valid_to);
  const now = new Date();
  const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / 86_400_000);

  if (daysRemaining < 0) {
    return [
      {
        type: "ssl_cert",
        severity: "critical",
        title: "TLS certificate has expired",
        description: `Certificate for ${domain} expired on ${cert.valid_to}`,
        dedupeKey: "ssl_cert:expired",
      },
    ];
  }
  if (daysRemaining <= CERT_EXPIRY_WARNING_DAYS) {
    return [
      {
        type: "ssl_cert",
        severity: daysRemaining <= 7 ? "high" : "medium",
        title: `TLS certificate expiring in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`,
        description: `Certificate for ${domain} expires on ${cert.valid_to}`,
        dedupeKey: "ssl_cert:expiring_soon",
      },
    ];
  }
  return []; // healthy — no finding
}

// --- CAA Record Checker ------------------------------------------------------

export async function checkCaaRecords(domain: string): Promise<SiteFindingInput[]> {
  try {
    const records = await resolveCaa(domain);
    if (!records || records.length === 0) {
      return [
        {
          type: "caa_record",
          severity: "low",
          title: "No CAA record configured",
          description: `${domain} has no CAA record — any public CA can issue certificates for it`,
          dedupeKey: "caa_record:missing",
        },
      ];
    }
    return [];
  } catch (err) {
    // ENODATA/ENOTFOUND (Node's dns errno codes) both mean "no CAA record" —
    // treated the same as an empty result, not a check failure.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENODATA" || code === "ENOTFOUND") {
      return [
        {
          type: "caa_record",
          severity: "low",
          title: "No CAA record configured",
          description: `${domain} has no CAA record — any public CA can issue certificates for it`,
          dedupeKey: "caa_record:missing",
        },
      ];
    }
    return [];
  }
}

// --- Subdomain Discovery (crt.sh, free/keyless) -----------------------------

type CrtShEntry = { name_value: string };

// crt.sh's own JSON endpoint over Certificate Transparency logs — free,
// keyless, per FUTURE-FEATURES.md's "no third-party API key" constraint.
export async function discoverSubdomainsViaCrtSh(domain: string, timeoutMs = 15_000): Promise<string[]> {
  const url = `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return [];
    const entries = (await res.json()) as CrtShEntry[];
    const names = new Set<string>();
    for (const entry of entries) {
      for (const raw of entry.name_value.split("\n")) {
        const name = raw.trim().toLowerCase().replace(/^\*\./, "");
        if (name.endsWith(domain) && name !== domain) names.add(name);
      }
    }
    return [...names];
  } catch {
    return []; // crt.sh down/rate-limited — skip this check, don't fail the whole rescan
  }
}

export async function checkNewSubdomains(siteId: string, domain: string): Promise<SiteFindingInput[]> {
  const discovered = await discoverSubdomainsViaCrtSh(domain);
  if (discovered.length === 0) return [];

  // Only previously-unseen subdomains are worth a new finding each run —
  // otherwise every rescan re-reports every known subdomain forever.
  const known = await prisma.siteFinding.findMany({
    where: { siteId, type: "subdomain" },
    select: { dedupeKey: true },
  });
  const knownKeys = new Set(known.map((k) => k.dedupeKey));

  const findings: SiteFindingInput[] = [];
  for (const subdomain of discovered) {
    const dedupeKey = `subdomain:${subdomainHash(subdomain)}`;
    if (knownKeys.has(dedupeKey)) continue;
    findings.push({
      type: "subdomain",
      severity: "info",
      title: `New subdomain discovered: ${subdomain}`,
      description: "Found via Certificate Transparency logs (crt.sh)",
      dedupeKey,
    });
  }
  return findings;
}

function subdomainHash(subdomain: string): string {
  return createHash("sha256").update(subdomain).digest("hex").slice(0, 16);
}

// --- Orchestration -----------------------------------------------------------

// Runs all three checks for one site and persists any new findings —
// analogous to how processBatchScan diffs/persists Finding rows, but scoped
// to SiteFinding's simpler opened-only model (subdomain/cert findings don't
// need the full opened/reopened/resolved diff a CI-run-shaped tool does).
export async function runSiteSecurityChecks(siteId: string, domain: string): Promise<{ created: number }> {
  const [sslFindings, caaFindings, subdomainFindings] = await Promise.all([
    checkSslCertificate(domain),
    checkCaaRecords(domain),
    checkNewSubdomains(siteId, domain),
  ]);

  const all = [...sslFindings, ...caaFindings, ...subdomainFindings];
  if (all.length === 0) return { created: 0 };

  const existing = await prisma.siteFinding.findMany({
    where: { siteId, dedupeKey: { in: all.map((f) => f.dedupeKey) } },
    select: { dedupeKey: true },
  });
  const existingKeys = new Set(existing.map((e) => e.dedupeKey));
  const toCreate = all.filter((f) => !existingKeys.has(f.dedupeKey));
  if (toCreate.length === 0) return { created: 0 };

  await prisma.siteFinding.createMany({
    data: toCreate.map((f) => ({ ...f, siteId })),
    skipDuplicates: true,
  });
  return { created: toCreate.length };
}
