import { describe, it, expect, vi, afterEach } from "vitest";
import { testAiProviderCall, completeText, listAvailableModels, AiProviderCallError } from "../ai-client";

describe("testAiProviderCall", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses Anthropic's usage shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ usage: { input_tokens: 12, output_tokens: 3 } }) })
    );
    const result = await testAiProviderCall("anthropic", "sk-ant-x", "claude-haiku-4-5");
    expect(result).toEqual({ promptTokens: 12, completionTokens: 3, totalTokens: 15 });
  });

  it("parses OpenAI's usage shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } }) })
    );
    const result = await testAiProviderCall("openai", "sk-x", "gpt-5.6-luna");
    expect(result).toEqual({ promptTokens: 10, completionTokens: 2, totalTokens: 12 });
  });

  it("parses xAI's usage shape (OpenAI-compatible)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ usage: { prompt_tokens: 8, completion_tokens: 1, total_tokens: 9 } }) })
    );
    const result = await testAiProviderCall("xai", "xai-x", "grok-4.3");
    expect(result).toEqual({ promptTokens: 8, completionTokens: 1, totalTokens: 9 });
  });

  it("parses Gemini's usageMetadata shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2, totalTokenCount: 7 } }) })
    );
    const result = await testAiProviderCall("google", "AIza-x", "gemini-3.5-flash-lite");
    expect(result).toEqual({ promptTokens: 5, completionTokens: 2, totalTokens: 7 });
  });

  it("throws AiProviderCallError with the provider's error message on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { message: "invalid x-api-key" } }) })
    );
    await expect(testAiProviderCall("anthropic", "bad-key", "claude-haiku-4-5")).rejects.toThrow(AiProviderCallError);
    await expect(testAiProviderCall("anthropic", "bad-key", "claude-haiku-4-5")).rejects.toThrow("invalid x-api-key");
  });
});

describe("completeText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts Anthropic's response text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ type: "text", text: "This is a critical SQL injection risk." }], usage: { input_tokens: 50, output_tokens: 10 } }),
      })
    );
    const result = await completeText("anthropic", "sk-ant-x", "claude-sonnet-5", "explain this");
    expect(result.text).toBe("This is a critical SQL injection risk.");
    expect(result.totalTokens).toBe(60);
  });

  it("extracts OpenAI/xAI's response text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "Looks like a real vulnerability." } }], usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 } }),
      })
    );
    const result = await completeText("openai", "sk-x", "gpt-5.6-terra", "explain this");
    expect(result.text).toBe("Looks like a real vulnerability.");
  });

  it("extracts Gemini's response text from candidates/parts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "Part one. " }, { text: "Part two." }] } }],
          usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 4, totalTokenCount: 19 },
        }),
      })
    );
    const result = await completeText("google", "AIza-x", "gemini-3.8-flash", "explain this");
    expect(result.text).toBe("Part one. Part two.");
  });

  it("returns an empty string, not a crash, when a provider omits response text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ usage: {} }) }));
    const result = await completeText("anthropic", "sk-ant-x", "claude-sonnet-5", "explain this");
    expect(result.text).toBe("");
  });
});

describe("listAvailableModels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses Anthropic's models list, preserving response order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: "claude-opus-5", display_name: "Claude Opus 5" },
            { id: "claude-haiku-4-5", display_name: "Claude Haiku 4.5" },
          ],
        }),
      })
    );
    const result = await listAvailableModels("anthropic", "sk-ant-x");
    expect(result).toEqual([
      { id: "claude-opus-5", label: "Claude Opus 5" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    ]);
  });

  it("filters non-chat models out of OpenAI's /models response and sorts newest first", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: "text-embedding-3-large", created: 500 },
            { id: "gpt-5.6-luna", created: 300 },
            { id: "gpt-6-astra", created: 800 },
            { id: "whisper-1", created: 100 },
          ],
        }),
      })
    );
    const result = await listAvailableModels("openai", "sk-x");
    expect(result).toEqual([
      { id: "gpt-6-astra", label: "gpt-6-astra" },
      { id: "gpt-5.6-luna", label: "gpt-5.6-luna" },
    ]);
  });

  it("filters Gemini models to only those supporting generateContent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { name: "models/gemini-3.8-flash", baseModelId: "gemini-3.8-flash", displayName: "Gemini 3.8 Flash", supportedGenerationMethods: ["generateContent"] },
            { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
          ],
        }),
      })
    );
    const result = await listAvailableModels("google", "AIza-x");
    expect(result).toEqual([{ id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" }]);
  });

  it("throws AiProviderCallError with the provider's error message on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { message: "invalid x-api-key" } }) })
    );
    await expect(listAvailableModels("anthropic", "bad-key")).rejects.toThrow(AiProviderCallError);
    await expect(listAvailableModels("anthropic", "bad-key")).rejects.toThrow("invalid x-api-key");
  });

  it("throws AiProviderCallError when the key is valid but returns no usable models", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }));
    await expect(listAvailableModels("openai", "sk-x")).rejects.toThrow(AiProviderCallError);
  });
});
