import { describe, it, expect } from "vitest";
import { AI_PROVIDER_LABELS } from "../ai-provider-catalog";

const PROVIDERS = ["anthropic", "openai", "xai", "google"] as const;

describe("AI provider catalog", () => {
  it("has a label for every provider", () => {
    for (const p of PROVIDERS) {
      expect(AI_PROVIDER_LABELS[p]).toBeTruthy();
    }
  });
});
