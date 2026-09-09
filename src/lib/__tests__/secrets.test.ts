import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret, computeKeyPreview } from "../secrets";

beforeAll(() => {
  // 32 random bytes, base64 — same shape as a real PROVIDER_SECRETS_KEY.
  process.env.PROVIDER_SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a plaintext value", () => {
    const ciphertext = encryptSecret("5F097598-606D-4CF3-B099-EAED14F04626");
    expect(ciphertext).not.toContain("5F097598");
    expect(decryptSecret(ciphertext)).toBe("5F097598-606D-4CF3-B099-EAED14F04626");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a).not.toBe(b);
  });
});

describe("computeKeyPreview", () => {
  it("keeps first/last 4 characters and masks the middle", () => {
    expect(computeKeyPreview("5F097598-606D-4CF3-B099-EAED14F04626")).toBe("5F09••••••••4626");
  });

  it("fully masks keys too short to safely show a prefix/suffix", () => {
    expect(computeKeyPreview("short")).toBe("••••••••");
  });
});
