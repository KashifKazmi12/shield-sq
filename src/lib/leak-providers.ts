import { createHash } from "crypto";
import { prisma } from "./prisma";
import { decryptSecret } from "./secrets";
import { checkRateLimit } from "./rate-limit";
import { PROVIDER_LABELS } from "./leak-provider-meta";
import type { LeakIdentifierType, LeakProvider } from "@prisma/client";

export { PROVIDER_IDS } from "./leak-provider-meta";

export type NormalizedFinding = {
  source: string;
  breachName: string;
  severity: "low" | "medium" | "high";
  leakedAt: Date | null;
  dedupeKey: string;
  details: Record<string, unknown>;
  // The real leaked password, kept separate from `details` (which only ever
  // holds the masked version) — encrypted by the caller before storage,
  // never logged/printed anywhere in this module.
  rawPassword: string | null;
};

// A password/hash is the one field that must never round-trip in full past
// this module — masked before it ever reaches LeakFinding.details, the
// findings list API, or the frontend. Same shape as the reference's
// maskPassword(), kept because it reads well ("ab••••yz") without leaking length.
export function maskSecret(value: unknown): string {
  const str = typeof value === "string" ? value : "";
  if (!str) return "••••••••";
  if (str.length <= 4) return "•".repeat(4);
  return `${str.slice(0, 2)}${"•".repeat(6)}${str.slice(-2)}`;
}

function stableDedupeKey(source: string, breachName: string, raw: Record<string, unknown>) {
  // Prefer a field that actually identifies *this* breach record (so the
  // same breach re-reported on a later sync doesn't create a duplicate
  // LeakFinding); fall back to hashing the whole normalized raw entry if
  // nothing more specific is present.
  const stableField =
    (raw.url as string | undefined) ||
    (raw.database_name as string | undefined) ||
    JSON.stringify(raw);
  return createHash("sha256").update(`${source}:${breachName}:${stableField}`).digest("hex");
}

// Derived from which sensitive fields the provider actually returned — the
// reference always writes "medium" regardless of content, so this is a
// deliberate improvement, not a port. Field names match what both providers
// actually return (see normalize* below): a plaintext password/hash present
// is the clearest signal of real exposure; other PII without a credential is
// a lesser signal; email/username alone (no other field populated) is the
// weakest.
export function computeSeverity(raw: Record<string, unknown>): "low" | "medium" | "high" {
  if (raw.password || raw.hash) return "high";
  if (raw.phone || raw.address || raw.dob || raw.database_name) return "medium";
  return "low";
}

function normalizeCheckLeakedEntry(entryWrapper: { entry?: Record<string, unknown> }): NormalizedFinding {
  const entry = entryWrapper.entry ?? {};
  const breachName = (entry.database_name as string) || (entry.source as string) || "CheckLeaked";
  // The breach date lives nested under `source.BreachDate`, not a top-level
  // `obtained_at`/`leaked_at` field — confirmed against a real response;
  // `obtained_from` is a source-name string, not a date, despite the name.
  const source = entry.source as { BreachDate?: string } | undefined;
  const rawPassword = typeof entry.password === "string" && entry.password ? entry.password : null;
  const raw = {
    email: entry.email,
    password: rawPassword, // masked below before storage; real value kept separately
    hash: entry.hashed_password ? true : undefined, // presence only — the actual hash isn't stored
    primary_field: entry.primary_field,
    database_name: entry.database_name,
    url: entry.url,
    obtained_from: entry.obtained_from,
  };
  const maskedRaw = { ...raw, password: maskSecret(raw.password) };
  return {
    source: "checkleaked",
    breachName,
    severity: computeSeverity(raw),
    leakedAt: parseDate(source?.BreachDate),
    dedupeKey: stableDedupeKey("checkleaked", breachName, maskedRaw),
    details: maskedRaw,
    rawPassword,
  };
}

function normalizeLeakCheckEntry(item: Record<string, unknown>, identifierValue: string): NormalizedFinding {
  const source = item.source as { name?: string; breach_date?: string } | string | undefined;
  const sourceName = typeof source === "string" ? source : source?.name;
  const breachDate = typeof source === "object" ? source?.breach_date : undefined;
  const breachName = sourceName || "LeakCheck";
  const rawPassword = typeof item.password === "string" && item.password ? item.password : null;
  const raw = {
    email: item.email || item.username || identifierValue,
    password: rawPassword, // LeakCheck's v2 query endpoint does return this for many breaches
    primary_field: item.field,
    database_name: sourceName,
    url: sourceName,
    obtained_from: sourceName,
  };
  const maskedRaw = { ...raw, password: maskSecret(raw.password) };
  return {
    source: "leakcheck",
    breachName,
    severity: computeSeverity(raw),
    leakedAt: parseDate(breachDate),
    dedupeKey: stableDedupeKey("leakcheck", breachName, maskedRaw),
    details: maskedRaw,
    rawPassword,
  };
}

export function parseDate(value?: string): Date | null {
  if (!value) return null;
  // Full ISO timestamp, "YYYY-MM-DD[ HH:MM:SS]", or LeakCheck's "YYYY-MM"
  // (year-month only, no day) — normalized to the 1st of that month.
  const formats = [
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    /^\d{4}-\d{2}-\d{2}$/,
  ];
  const normalized = /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;
  if (!formats.some((re) => re.test(normalized))) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function callCheckLeaked(apiKey: string, entry: string, type: LeakIdentifierType): Promise<NormalizedFinding[]> {
  const res = await fetch("https://api.checkleaked.cc/api/dehashed", {
    method: "POST",
    headers: { accept: "application/json", "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ entry, type, page: 1 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`CheckLeaked responded ${res.status}`);
  const data = (await res.json()) as { results?: number; entries?: { entry?: Record<string, unknown> }[] };
  if (!data.results || data.results <= 0) return [];
  return (data.entries ?? []).map(normalizeCheckLeakedEntry);
}

async function callLeakCheck(apiKey: string, entry: string, type: LeakIdentifierType): Promise<NormalizedFinding[]> {
  const res = await fetch(
    `https://leakcheck.io/api/v2/query/${encodeURIComponent(entry)}?type=${type}`,
    { headers: { accept: "application/json", "X-API-Key": apiKey }, signal: AbortSignal.timeout(30_000) }
  );
  if (!res.ok) throw new Error(`LeakCheck responded ${res.status}`);
  const data = (await res.json()) as { found?: number; result?: Record<string, unknown>[] };
  if (!data.found || data.found <= 0) return [];
  return (data.result ?? []).map((item) => normalizeLeakCheckEntry(item, entry));
}

// Single source of truth for every integrated provider — the Configuration
// UI, ensureProviderConfigRows, and the fallback/test-call logic below all
// derive from this instead of hardcoding provider lists, so adding a 3rd
// (4th, 5th...) provider is: add a value to the LeakProvider enum (new
// migration), write its call function, and add one entry here. Everything
// else (priority ordering, usage tracking, quota, UI) already handles an
// arbitrary number of providers.
const PROVIDER_REGISTRY: Record<
  LeakProvider,
  { label: string; call: (apiKey: string, entry: string, type: LeakIdentifierType) => Promise<NormalizedFinding[]> }
> = {
  checkleaked: { label: PROVIDER_LABELS.checkleaked, call: callCheckLeaked },
  leakcheck: { label: PROVIDER_LABELS.leakcheck, call: callLeakCheck },
};

export class QuotaExceededError extends Error {
  constructor(public tier: "global" | "company" | "user", public limit: number) {
    super(`Leak check limit reached (${tier} limit: ${limit}/day)`);
  }
}

// Checked before attempting any provider call — a rejection here never
// counts as a call and never falls through to try the next provider.
async function checkProviderQuota(companyId: string | null, userId: string | null) {
  const limits = await prisma.leakProviderLimits.findUnique({ where: { id: "default" } });
  if (!limits) return;

  const since = new Date();
  since.setHours(0, 0, 0, 0);

  if (limits.globalDailyLimit != null) {
    const count = await prisma.leakProviderUsage.count({ where: { createdAt: { gte: since } } });
    if (count >= limits.globalDailyLimit) throw new QuotaExceededError("global", limits.globalDailyLimit);
  }
  if (companyId && limits.perCompanyDailyLimit != null) {
    const count = await prisma.leakProviderUsage.count({ where: { companyId, createdAt: { gte: since } } });
    if (count >= limits.perCompanyDailyLimit) throw new QuotaExceededError("company", limits.perCompanyDailyLimit);
  }
  if (userId && limits.perUserDailyLimit != null) {
    const count = await prisma.leakProviderUsage.count({ where: { userId, createdAt: { gte: since } } });
    if (count >= limits.perUserDailyLimit) throw new QuotaExceededError("user", limits.perUserDailyLimit);
  }
}

// Short in-memory cache so a bulk sync of many identities doesn't hit the DB
// for provider config on every single one — invalidated by TTL, not by the
// Configuration save action (a 60s-stale priority/key is an acceptable
// tradeoff for not needing a cross-request invalidation mechanism).
let configCache: { at: number; rows: { provider: LeakProvider; apiKeyCiphertext: string | null; enabled: boolean; priority: number }[] } | null = null;

export function invalidateProviderConfigCache() {
  configCache = null;
}

async function getOrderedProviderConfigs() {
  if (configCache && Date.now() - configCache.at < 60_000) return configCache.rows;
  const rows = await prisma.leakProviderConfig.findMany({
    where: { enabled: true, apiKeyCiphertext: { not: null } },
    orderBy: { priority: "asc" },
    select: { provider: true, apiKeyCiphertext: true, enabled: true, priority: true },
  });
  configCache = { at: Date.now(), rows };
  return rows;
}

// One real outbound call: decrypt, invoke, log usage, bump the resettable
// counter. Shared by checkIdentity's fallback chain and testProvider's
// single-shot connectivity check, so both paths log/count identically.
async function attemptProviderCall(
  config: { provider: LeakProvider; apiKeyCiphertext: string | null },
  entry: string,
  type: LeakIdentifierType,
  attribution: { companyId: string | null; userId: string | null }
): Promise<{ success: boolean; findings: NormalizedFinding[] }> {
  checkRateLimit(`leak-provider:${config.provider}`); // paces bursts within a bulk sync; doesn't block on its own
  let findings: NormalizedFinding[] = [];
  let success = true;
  try {
    const apiKey = decryptSecret(config.apiKeyCiphertext!);
    findings = await PROVIDER_REGISTRY[config.provider].call(apiKey, entry, type);
  } catch {
    success = false;
  }
  await prisma.$transaction([
    prisma.leakProviderUsage.create({
      data: { provider: config.provider, companyId: attribution.companyId, userId: attribution.userId, success },
    }),
    prisma.leakProviderConfig.update({
      where: { provider: config.provider },
      data: { usageCount: { increment: 1 } },
    }),
  ]);
  return { success, findings };
}

// Runs the fallback chain (priority order from the Configuration table) and
// records one LeakProviderUsage row per provider actually attempted.
export async function checkIdentity(
  identifierValue: string,
  identifierType: LeakIdentifierType,
  attribution: { companyId: string | null; userId: string | null }
): Promise<NormalizedFinding[]> {
  await checkProviderQuota(attribution.companyId, attribution.userId);

  const configs = await getOrderedProviderConfigs();
  for (const config of configs) {
    const { success, findings } = await attemptProviderCall(config, identifierValue, identifierType, attribution);
    if (success && findings.length > 0) return findings;
  }
  return [];
}

// Fixed, harmless identifier used only to prove a provider is reachable and
// correctly authenticated — never tied to any real company data (companyId
// stays null; the calling super admin is still attributed for the usage log).
const TEST_IDENTIFIER = "test@example.com";

export class ProviderNotUsableError extends Error {}

// One-shot connectivity/functionality check for a single provider, run from
// the Configuration page's "Try it" button — bypasses the fallback chain and
// the per-company/per-user quota (this is a platform diagnostic action, not
// a company's usage) but still logs to LeakProviderUsage/usageCount so the
// call is honestly reflected in the totals.
export async function testProvider(provider: LeakProvider, userId: string): Promise<{ findingsCount: number }> {
  const config = await prisma.leakProviderConfig.findUnique({ where: { provider } });
  if (!config?.enabled || !config.apiKeyCiphertext) {
    throw new ProviderNotUsableError("This provider has no key configured, or is disabled");
  }
  const { success, findings } = await attemptProviderCall(config, TEST_IDENTIFIER, "email", {
    companyId: null,
    userId,
  });
  if (!success) throw new Error("Provider call failed — check the API key and try again");
  return { findingsCount: findings.length };
}

// Moves one provider to `targetPriority` (1-based position among however
// many providers exist) and resequences everyone else to 1..N — a real
// reorder, not a pairwise swap, so this scales to any number of providers
// instead of only working correctly for exactly two.
export async function reorderProviderPriority(provider: LeakProvider, targetPriority: number) {
  await prisma.$transaction(async (tx) => {
    const all = await tx.leakProviderConfig.findMany({ orderBy: { priority: "asc" } });
    const withoutTarget = all.filter((c) => c.provider !== provider);
    const clampedIndex = Math.max(0, Math.min(targetPriority - 1, all.length - 1));
    withoutTarget.splice(clampedIndex, 0, all.find((c) => c.provider === provider)!);

    await Promise.all(
      withoutTarget.map((c, i) =>
        tx.leakProviderConfig.update({ where: { provider: c.provider }, data: { priority: i + 1 } })
      )
    );
  });
  invalidateProviderConfigCache();
}
