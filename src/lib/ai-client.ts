import type { AiProvider } from "@/generated/prisma";

export type AiCallResult = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type AiCompletionResult = AiCallResult & { text: string };

export class AiProviderCallError extends Error {}

const TEST_PROMPT = "Reply with the single word: ok";
const DEFAULT_MAX_TOKENS = 800;

function sumTokens(promptTokens: number | null, completionTokens: number | null): number | null {
  return promptTokens != null && completionTokens != null ? promptTokens + completionTokens : null;
}

async function callAnthropic(apiKey: string, model: string, prompt: string, maxTokens: number): Promise<AiCompletionResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
    error?: { message?: string };
  };
  if (!res.ok) throw new AiProviderCallError(data.error?.message ?? `Anthropic responded ${res.status}`);
  const promptTokens = data.usage?.input_tokens ?? null;
  const completionTokens = data.usage?.output_tokens ?? null;
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  return { text, promptTokens, completionTokens, totalTokens: sumTokens(promptTokens, completionTokens) };
}

// xAI is OpenAI-API-compatible — one helper, two base URLs.
async function callOpenAiCompatible(
  baseUrl: string,
  providerLabel: string,
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens: number
): Promise<AiCompletionResult> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    error?: { message?: string };
  };
  if (!res.ok) throw new AiProviderCallError(data.error?.message ?? `${providerLabel} responded ${res.status}`);
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    promptTokens: data.usage?.prompt_tokens ?? null,
    completionTokens: data.usage?.completion_tokens ?? null,
    totalTokens: data.usage?.total_tokens ?? null,
  };
}

async function callGoogle(apiKey: string, model: string, prompt: string, maxTokens: number): Promise<AiCompletionResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
      signal: AbortSignal.timeout(30_000),
    }
  );
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    error?: { message?: string };
  };
  if (!res.ok) throw new AiProviderCallError(data.error?.message ?? `Gemini responded ${res.status}`);
  return {
    text: data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "",
    promptTokens: data.usageMetadata?.promptTokenCount ?? null,
    completionTokens: data.usageMetadata?.candidatesTokenCount ?? null,
    totalTokens: data.usageMetadata?.totalTokenCount ?? null,
  };
}

const AI_PROVIDER_REGISTRY: Record<AiProvider, (apiKey: string, model: string, prompt: string, maxTokens: number) => Promise<AiCompletionResult>> = {
  anthropic: callAnthropic,
  openai: (apiKey, model, prompt, maxTokens) => callOpenAiCompatible("https://api.openai.com/v1", "OpenAI", apiKey, model, prompt, maxTokens),
  xai: (apiKey, model, prompt, maxTokens) => callOpenAiCompatible("https://api.x.ai/v1", "xAI", apiKey, model, prompt, maxTokens),
  google: callGoogle,
};

export async function completeText(
  provider: AiProvider,
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens: number = DEFAULT_MAX_TOKENS
): Promise<AiCompletionResult> {
  return AI_PROVIDER_REGISTRY[provider](apiKey, model, prompt, maxTokens);
}

export async function testAiProviderCall(provider: AiProvider, apiKey: string, model: string): Promise<AiCallResult> {
  const { text: _text, ...tokens } = await completeText(provider, apiKey, model, TEST_PROMPT, 8);
  return tokens;
}

export type AiModelListEntry = { id: string; label: string };

// /v1/models (OpenAI, xAI) lists every model the account can see, including
// non-chat ones (embeddings, TTS, image, moderation) — filtered out here
// since the Settings model picker is chat-completion only.
const NON_CHAT_MODEL_HINTS = [
  "embedding",
  "whisper",
  "tts",
  "dall-e",
  "moderation",
  "davinci-",
  "babbage-",
  "curie-",
  "ada-",
  "image",
  "audio",
  "realtime",
  "transcribe",
];
function isLikelyChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  return !NON_CHAT_MODEL_HINTS.some((hint) => lower.includes(hint));
}

async function listAnthropicModels(apiKey: string): Promise<AiModelListEntry[]> {
  const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json()) as { data?: { id: string; display_name?: string }[]; error?: { message?: string } };
  if (!res.ok) throw new AiProviderCallError(data.error?.message ?? `Anthropic responded ${res.status}`);
  // Anthropic returns most-recently-released models first — preserve that order.
  return (data.data ?? []).map((m) => ({ id: m.id, label: m.display_name ?? m.id }));
}

async function listOpenAiCompatibleModels(baseUrl: string, providerLabel: string, apiKey: string): Promise<AiModelListEntry[]> {
  const res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json()) as { data?: { id: string; created?: number }[]; error?: { message?: string } };
  if (!res.ok) throw new AiProviderCallError(data.error?.message ?? `${providerLabel} responded ${res.status}`);
  return (data.data ?? [])
    .filter((m) => isLikelyChatModel(m.id))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .map((m) => ({ id: m.id, label: m.id }));
}

async function listGoogleModels(apiKey: string): Promise<AiModelListEntry[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey)}`,
    { signal: AbortSignal.timeout(15_000) }
  );
  const data = (await res.json()) as {
    models?: { name: string; baseModelId?: string; displayName?: string; supportedGenerationMethods?: string[] }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new AiProviderCallError(data.error?.message ?? `Gemini responded ${res.status}`);
  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => ({ id: m.baseModelId || m.name.replace(/^models\//, ""), label: m.displayName ?? m.name }));
}

const AI_MODEL_LIST_REGISTRY: Record<AiProvider, (apiKey: string) => Promise<AiModelListEntry[]>> = {
  anthropic: listAnthropicModels,
  openai: (apiKey) => listOpenAiCompatibleModels("https://api.openai.com/v1", "OpenAI", apiKey),
  xai: (apiKey) => listOpenAiCompatibleModels("https://api.x.ai/v1", "xAI", apiKey),
  google: listGoogleModels,
};

export async function listAvailableModels(provider: AiProvider, apiKey: string): Promise<AiModelListEntry[]> {
  const models = await AI_MODEL_LIST_REGISTRY[provider](apiKey);
  if (models.length === 0) throw new AiProviderCallError("This key returned no available models");
  return models;
}
