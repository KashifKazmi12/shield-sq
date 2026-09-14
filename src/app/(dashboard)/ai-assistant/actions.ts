"use server";

import { requireCompanySession } from "@/lib/session";
import { requireCompanyFeature } from "@/lib/rbac";
import { runAiPrompt, NoActiveAiProviderError, DailyAiCapExceededError } from "@/lib/ai-runtime";
import { buildChatPrompt } from "@/lib/ai-prompts";
import { getCompanyPostureSummary } from "@/lib/ai-posture";
import { AiProviderCallError } from "@/lib/ai-client";

export async function askSecurityChat(question: string): Promise<{ answer: string }> {
  const { companyId } = await requireCompanySession();
  await requireCompanyFeature(companyId, "ai_assistant");
  const trimmed = question.trim();
  if (!trimmed) throw new Error("Ask a question first");

  try {
    const summary = await getCompanyPostureSummary(companyId);
    const prompt = buildChatPrompt(trimmed, summary);
    const result = await runAiPrompt(companyId, { kind: "chat", prompt, maxTokens: 500 });
    return { answer: result.content };
  } catch (err) {
    if (err instanceof NoActiveAiProviderError || err instanceof DailyAiCapExceededError || err instanceof AiProviderCallError) {
      throw new Error(err.message);
    }
    throw new Error("AI request failed");
  }
}
