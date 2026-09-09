import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

// Encrypts provider API keys at rest (LeakProviderConfig.apiKeyCiphertext).
// AES-256-GCM: random 12-byte IV per encryption, auth tag appended so
// tampering/corruption is detected on decrypt rather than silently producing
// garbage. Key comes from PROVIDER_SECRETS_KEY (32 random bytes, base64) —
// generate with `openssl rand -base64 32`, same as NEXTAUTH_SECRET.
function getKey(): Buffer {
  const raw = process.env.PROVIDER_SECRETS_KEY;
  if (!raw) throw new Error("PROVIDER_SECRETS_KEY is not configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("PROVIDER_SECRETS_KEY must decode to exactly 32 bytes");
  }
  return key;
}

// Stored as "iv:authTag:ciphertext", each base64 — plain enough to store in
// a single text column, self-contained enough to decrypt without anything
// else from the row.
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted secret");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// Fixed-width mask so the preview never leaks the real key's length either
// — e.g. "5F09••••••••4626". Computed once at save time; this is the only
// representation of a provider key any read of LeakProviderConfig returns.
export function computeKeyPreview(rawKey: string): string {
  if (rawKey.length <= 8) return "•".repeat(8);
  return `${rawKey.slice(0, 4)}${"•".repeat(8)}${rawKey.slice(-4)}`;
}
