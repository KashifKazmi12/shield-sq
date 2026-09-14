import type { AiProvider } from "@prisma/client";
import { prisma } from "./prisma";
import { decryptSecret } from "./secrets";
import { completeText, AiProviderCallError } from "./ai-client";

export class NoActiveAiProviderError extends Error {
  constructor() {
    super("No active AI provider configured. Set one up in Settings → AI Assistant.");
  }
}

export class DailyAiCapExceededError extends Error {
  constructor() {
    super("Daily AI usage limit reached for this company. Try again tomorrow.");
  }
}

export async function getActiveAiProvider(
  companyId: string
): Promise<{ provider: AiProvider; apiKey: string; model: string } | null> {
  const config = await prisma.aiProviderConfig.findFirst({
    where: { companyId, isActive: true },
  });
  if (!config?.apiKeyCiphertext || !config.model) return null;
  return { provider: config.provider, apiKey: decryptSecret(config.apiKeyCiphertext), model: config.model };
}

// Cheap existence check for gating UI (show/hide the AI buttons and widget)
// without decrypting a key just to answer a boolean.
export async function hasActiveAiProvider(companyId: string): Promise<boolean> {
  const config = await prisma.aiProviderConfig.findFirst({
    where: { companyId, isActive: true, apiKeyCiphertext: { not: null }, model: { not: null } },
    select: { id: true },
  });
  return config !== null;
}

// Combines the company-level feature flag with "has an admin actually
// activated a key" — the single check every AI-feature-gated page uses to
// decide whether to render its AI buttons/panels at all.
export async function isAiAssistantAvailable(companyId: string): Promise<boolean> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { features: true } });
  if (!company?.features.includes("ai_assistant")) return false;
  return hasActiveAiProvider(companyId);
}

// Hardcoded for now — a super-admin-configurable per-company cap (mirroring
// LeakProviderLimits) is a reasonable follow-up, not built in this pass.
const DAILY_TOKEN_CAP = 200_000;

async function assertUnderDailyCap(companyId: string): Promise<void> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const usedToday = await prisma.aiUsageLog.aggregate({
    where: { companyId, createdAt: { gte: since } },
    _sum: { totalTokens: true },
  });
  if ((usedToday._sum.totalTokens ?? 0) >= DAILY_TOKEN_CAP) {
    throw new DailyAiCapExceededError();
  }
}

export type AiInsightKind = "explanation" | "priority" | "correlation" | "chat";

// The single choke point every AI feature calls through — checks the daily
// cap, makes the real call, and logs both AiUsageLog (token accounting,
// already used by Settings' Test Connection) and AiInsight (the actual
// output, kept separate from Finding's own ground-truth fields).
export async function runAiPrompt(
  companyId: string,
  params: { kind: AiInsightKind; findingId?: string; prompt: string; maxTokens?: number }
): Promise<{ content: string }> {
  const active = await getActiveAiProvider(companyId);
  if (!active) throw new NoActiveAiProviderError();
  await assertUnderDailyCap(companyId);

  try {
    const result = await completeText(active.provider, active.apiKey, active.model, params.prompt, params.maxTokens);
    await prisma.$transaction([
      prisma.aiUsageLog.create({
        data: {
          companyId,
          provider: active.provider,
          model: active.model,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens,
          success: true,
        },
      }),
      prisma.aiInsight.create({
        data: {
          companyId,
          kind: params.kind,
          findingId: params.findingId ?? null,
          provider: active.provider,
          model: active.model,
          prompt: params.prompt,
          content: result.text,
        },
      }),
    ]);
    return { content: result.text };
  } catch (err) {
    const message = err instanceof AiProviderCallError ? err.message : "AI call failed";
    await prisma.aiUsageLog.create({
      data: { companyId, provider: active.provider, model: active.model, success: false, detail: message },
    });
    throw err instanceof AiProviderCallError ? err : new AiProviderCallError(message);
  }
}

export async function getCachedInsight(companyId: string, kind: AiInsightKind, findingId: string) {
  return prisma.aiInsight.findFirst({
    where: { companyId, kind, findingId },
    orderBy: { createdAt: "desc" },
  });
}
