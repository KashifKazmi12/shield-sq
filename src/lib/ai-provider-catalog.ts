import type { AiProvider } from "@prisma/client";

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  xai: "xAI (Grok)",
  google: "Google (Gemini)",
};
