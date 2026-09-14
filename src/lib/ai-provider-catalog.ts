import type { AiProvider } from "@/generated/prisma";

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  xai: "xAI (Grok)",
  google: "Google (Gemini)",
};
