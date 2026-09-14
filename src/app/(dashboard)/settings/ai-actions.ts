"use server";

import { revalidatePath } from "next/cache";
import type { AiProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireCompanyFeature } from "@/lib/rbac";
import { logAdminAction } from "@/lib/audit";
import { encryptSecret, decryptSecret, computeKeyPreview } from "@/lib/secrets";
import { testAiProviderCall, listAvailableModels, AiProviderCallError, type AiModelListEntry } from "@/lib/ai-client";

async function requireAiFeature() {
  const admin = await requireAdmin();
  await requireCompanyFeature(admin.companyId, "ai_assistant");
  return admin;
}

export async function getAiProviderConfigs() {
  const { companyId } = await requireAiFeature();
  const rows = await prisma.aiProviderConfig.findMany({ where: { companyId } });
  return rows.map(({ apiKeyCiphertext, ...rest }) => ({ ...rest, hasKey: apiKeyCiphertext != null }));
}

export async function updateAiApiKey(provider: AiProvider, apiKey: string) {
  const { companyId, email } = await requireAiFeature();
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error("API key is required");

  await prisma.aiProviderConfig.upsert({
    where: { companyId_provider: { companyId, provider } },
    update: { apiKeyCiphertext: encryptSecret(trimmed), apiKeyPreview: computeKeyPreview(trimmed) },
    create: { companyId, provider, apiKeyCiphertext: encryptSecret(trimmed), apiKeyPreview: computeKeyPreview(trimmed) },
  });
  await logAdminAction({ companyId, actorEmail: email, action: "ai_provider.set_key", detail: `provider=${provider}` });
  revalidatePath("/settings");
}

export async function deleteAiApiKey(provider: AiProvider) {
  const { companyId, email } = await requireAiFeature();
  await prisma.aiProviderConfig.updateMany({
    where: { companyId, provider },
    data: { apiKeyCiphertext: null, apiKeyPreview: null, model: null, isActive: false },
  });
  await logAdminAction({ companyId, actorEmail: email, action: "ai_provider.delete_key", detail: `provider=${provider}` });
  revalidatePath("/settings");
}

export async function updateAiModel(provider: AiProvider, model: string) {
  const { companyId, email } = await requireAiFeature();
  const trimmedModel = model.trim();
  // Model ids come from either the static catalog or a live fetch from the
  // provider's own /models endpoint (fetchModelsForProvider) — both trusted
  // sources, so this is just a sanity check against garbage/empty input.
  if (!trimmedModel || trimmedModel.length > 200) {
    throw new Error("Invalid model id");
  }
  const config = await prisma.aiProviderConfig.findUnique({ where: { companyId_provider: { companyId, provider } } });
  if (!config?.apiKeyCiphertext) throw new Error("Save an API key for this provider first");

  await prisma.aiProviderConfig.update({
    where: { companyId_provider: { companyId, provider } },
    data: { model: trimmedModel },
  });
  await logAdminAction({ companyId, actorEmail: email, action: "ai_provider.set_model", detail: `provider=${provider} model=${trimmedModel}` });
  revalidatePath("/settings");
}

export async function fetchModelsForProvider(provider: AiProvider): Promise<AiModelListEntry[]> {
  const { companyId } = await requireAiFeature();
  const config = await prisma.aiProviderConfig.findUnique({ where: { companyId_provider: { companyId, provider } } });
  if (!config?.apiKeyCiphertext) throw new Error("Save an API key for this provider first");

  try {
    const apiKey = decryptSecret(config.apiKeyCiphertext);
    return await listAvailableModels(provider, apiKey);
  } catch (err) {
    throw new Error(err instanceof AiProviderCallError ? err.message : "Couldn't fetch the model list for this key");
  }
}

export async function setActiveAiProvider(provider: AiProvider) {
  const { companyId, email } = await requireAiFeature();
  const config = await prisma.aiProviderConfig.findUnique({ where: { companyId_provider: { companyId, provider } } });
  if (!config?.apiKeyCiphertext || !config.model) {
    throw new Error("Configure an API key and model for this provider first");
  }

  await prisma.$transaction([
    prisma.aiProviderConfig.updateMany({ where: { companyId }, data: { isActive: false } }),
    prisma.aiProviderConfig.update({ where: { companyId_provider: { companyId, provider } }, data: { isActive: true } }),
  ]);
  await logAdminAction({ companyId, actorEmail: email, action: "ai_provider.set_active", detail: `provider=${provider}` });
  revalidatePath("/settings");
}

export async function testAiConnection(provider: AiProvider): Promise<{ success: boolean; message: string }> {
  const { companyId, email } = await requireAiFeature();
  const config = await prisma.aiProviderConfig.findUnique({ where: { companyId_provider: { companyId, provider } } });
  if (!config?.apiKeyCiphertext || !config.model) {
    throw new Error("Configure an API key and model for this provider first");
  }

  try {
    const apiKey = decryptSecret(config.apiKeyCiphertext);
    const result = await testAiProviderCall(provider, apiKey, config.model);
    await prisma.aiUsageLog.create({
      data: {
        companyId,
        provider,
        model: config.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalTokens: result.totalTokens,
        success: true,
      },
    });
    await logAdminAction({ companyId, actorEmail: email, action: "ai_provider.test", detail: `provider=${provider} model=${config.model} result=success` });
    revalidatePath("/settings");
    return { success: true, message: `Connected — ${result.totalTokens ?? "?"} tokens used.` };
  } catch (err) {
    const message = err instanceof AiProviderCallError ? err.message : "Connection failed";
    await prisma.aiUsageLog.create({
      data: { companyId, provider, model: config.model, success: false, detail: message },
    });
    await logAdminAction({ companyId, actorEmail: email, action: "ai_provider.test", detail: `provider=${provider} model=${config.model} result=failed: ${message}` });
    revalidatePath("/settings");
    return { success: false, message };
  }
}

const AI_USAGE_INITIAL_TAKE = 7;

export async function getAiUsageStats() {
  const { companyId } = await requireAiFeature();
  const take = AI_USAGE_INITIAL_TAKE;
  const [totals, recentRows] = await Promise.all([
    prisma.aiUsageLog.aggregate({
      where: { companyId },
      _count: { _all: true },
      _sum: { totalTokens: true },
    }),
    prisma.aiUsageLog.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: take + 1,
    }),
  ]);

  const hasMore = recentRows.length > take;
  const recent = hasMore ? recentRows.slice(0, take) : recentRows;
  return {
    totalCalls: totals._count._all,
    totalTokens: totals._sum.totalTokens ?? 0,
    recent,
    nextCursor: hasMore ? recent[recent.length - 1].id : null,
  };
}

export async function loadMoreAiUsage(cursor: string) {
  const { companyId } = await requireAiFeature();
  const take = AI_USAGE_INITIAL_TAKE;
  const rows = await prisma.aiUsageLog.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    cursor: { id: cursor },
    skip: 1,
  });

  const hasMore = rows.length > take;
  const usage = hasMore ? rows.slice(0, take) : rows;
  return {
    rows: usage.map((r) => ({
      id: r.id,
      provider: r.provider,
      model: r.model,
      totalTokens: r.totalTokens,
      success: r.success,
      createdAt: r.createdAt.toISOString(),
      detail: r.detail,
    })),
    nextCursor: hasMore ? usage[usage.length - 1].id : null,
  };
}
