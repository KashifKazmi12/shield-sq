"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { encryptSecret, computeKeyPreview } from "@/lib/secrets";
import {
  testProvider as testProviderConnectivity,
  reorderProviderPriority,
  invalidateProviderConfigCache,
  ProviderNotUsableError,
} from "@/lib/leak-providers";
import { PROVIDER_IDS } from "@/lib/leak-provider-meta";
import type { LeakProvider } from "@prisma/client";

// Ensures every registered provider (see PROVIDER_REGISTRY in
// leak-providers.ts) has a config row so the page always has exactly one row
// per provider to render/edit — called from page.tsx on every load, cheap
// no-op once all rows exist. Adding a new provider to the registry means it
// shows up here automatically on next load, at the next available priority.
export async function ensureProviderConfigRows() {
  await requireSuperAdmin();
  const existing = await prisma.leakProviderConfig.findMany({ select: { provider: true, priority: true } });
  const existingIds = new Set(existing.map((c) => c.provider));
  let nextPriority = existing.length ? Math.max(...existing.map((c) => c.priority)) + 1 : 1;
  for (const provider of PROVIDER_IDS) {
    if (existingIds.has(provider)) continue;
    await prisma.leakProviderConfig.create({ data: { provider, priority: nextPriority } });
    nextPriority += 1;
  }
  await prisma.leakProviderLimits.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}

export async function updateProviderKey(provider: LeakProvider, apiKey: string) {
  const session = await requireSuperAdmin();
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error("API key is required");

  await prisma.leakProviderConfig.update({
    where: { provider },
    data: {
      apiKeyCiphertext: encryptSecret(trimmed),
      apiKeyPreview: computeKeyPreview(trimmed),
      updatedById: session.user!.id as string,
    },
  });
  invalidateProviderConfigCache();
  revalidatePath("/configuration");
}

export async function clearProviderKey(provider: LeakProvider) {
  const session = await requireSuperAdmin();
  await prisma.leakProviderConfig.update({
    where: { provider },
    data: { apiKeyCiphertext: null, apiKeyPreview: null, updatedById: session.user!.id as string },
  });
  invalidateProviderConfigCache();
  revalidatePath("/configuration");
}

export async function setProviderEnabled(provider: LeakProvider, enabled: boolean) {
  const session = await requireSuperAdmin();
  await prisma.leakProviderConfig.update({
    where: { provider },
    data: { enabled, updatedById: session.user!.id as string },
  });
  invalidateProviderConfigCache();
  revalidatePath("/configuration");
}

// Moves the provider to `priority` (1-based position) and resequences every
// other provider around it — works for any number of registered providers,
// not just a pairwise swap between exactly two.
export async function setProviderPriority(provider: LeakProvider, priority: number) {
  await requireSuperAdmin();
  await reorderProviderPriority(provider, priority);
  revalidatePath("/configuration");
}

export async function resetProviderUsageCount(provider: LeakProvider) {
  const session = await requireSuperAdmin();
  await prisma.leakProviderConfig.update({
    where: { provider },
    data: { usageCount: 0, updatedById: session.user!.id as string },
  });
  revalidatePath("/configuration");
}

// "Try it" — a real outbound call against a fixed, harmless test identifier,
// so the super admin can confirm a key actually works right after saving it,
// without needing a real company/identity. Bypasses per-company/user quota
// (this is a platform diagnostic, not a company's usage) but still logs to
// LeakProviderUsage/usageCount like any other call.
export async function testProvider(provider: LeakProvider) {
  const session = await requireSuperAdmin();
  try {
    return await testProviderConnectivity(provider, session.user!.id as string);
  } catch (err) {
    if (err instanceof ProviderNotUsableError) throw err;
    throw new Error(err instanceof Error ? err.message : "Test failed");
  } finally {
    // Runs regardless of outcome — a test call increments usageCount and
    // writes a LeakProviderUsage row either way, so the page's counts need
    // refreshing whether the test succeeded or failed.
    revalidatePath("/configuration");
  }
}

export async function updateProviderLimits(input: {
  globalDailyLimit: number | null;
  perCompanyDailyLimit: number | null;
  perUserDailyLimit: number | null;
}) {
  await requireSuperAdmin();
  await prisma.leakProviderLimits.upsert({
    where: { id: "default" },
    update: input,
    create: { id: "default", ...input },
  });
  revalidatePath("/configuration");
}

export async function getProviderUsage(windowDays: 1 | 7 | 30) {
  await requireSuperAdmin();
  const since = new Date();
  since.setDate(since.getDate() - (windowDays - 1));
  since.setHours(0, 0, 0, 0);

  const rows = await prisma.leakProviderUsage.findMany({
    where: { createdAt: { gte: since } },
    include: { company: { select: { name: true } } },
  });

  const byProvider: Record<string, { total: number; success: number; failure: number }> = {};
  const byCompany = new Map<string, { name: string; count: number }>();

  for (const row of rows) {
    const bucket = (byProvider[row.provider] ??= { total: 0, success: 0, failure: 0 });
    bucket.total += 1;
    if (row.success) bucket.success += 1;
    else bucket.failure += 1;

    if (row.companyId) {
      const entry = byCompany.get(row.companyId) ?? { name: row.company?.name ?? "Unknown", count: 0 };
      entry.count += 1;
      byCompany.set(row.companyId, entry);
    }
  }

  const topCompanies = Array.from(byCompany.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { byProvider, topCompanies, totalCalls: rows.length };
}
