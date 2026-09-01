import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { hashToken } from "./token";
import { checkRateLimit } from "./rate-limit";
import { MAX_INGEST_PAYLOAD_BYTES } from "./constants";

// Disabled while the system is in testing — repeated test/CI runs against
// the same token shouldn't get 429s. Flip back to true before this is
// exposed to anything but you.
const RATE_LIMITING_ENABLED = false;

export type IngestAuthResult =
  | { ok: true; projectId: string; tokenId: string }
  | { ok: false; status: number; reason: string; detail?: string; retryAfterSeconds?: number };

export async function authenticateIngestRequest(
  request: Request
): Promise<IngestAuthResult> {
  const authHeader = request.headers.get("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return { ok: false, status: 401, reason: "invalid_token", detail: "Missing bearer token" };
  }

  const tokenHash = hashToken(token);
  const ingestToken = await prisma.ingestToken.findUnique({
    where: { tokenHash },
  });

  if (!ingestToken || ingestToken.revokedAt) {
    return { ok: false, status: 401, reason: "invalid_token", detail: "Unknown or revoked token" };
  }

  if (RATE_LIMITING_ENABLED) {
    const rateLimit = checkRateLimit(ingestToken.id);
    if (!rateLimit.allowed) {
      return {
        ok: false,
        status: 429,
        reason: "rate_limited",
        detail: "Too many requests",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      };
    }
  }

  return { ok: true, projectId: ingestToken.projectId, tokenId: ingestToken.id };
}

// Shared shape for the (auth failed) branch in both ingest routes — keeps
// the Retry-After header in one place instead of duplicated per route.
export function ingestAuthErrorResponse(auth: Extract<IngestAuthResult, { ok: false }>) {
  const headers = auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined;
  return NextResponse.json({ error: auth.reason, detail: auth.detail }, { status: auth.status, headers });
}

// Cheap first-pass check against the request's declared Content-Length,
// before anything is read — an honest oversized request is rejected without
// even opening the stream. Not a guarantee on its own: Content-Length can be
// absent or understated, which is what readJsonWithLimit below actually
// enforces against.
export function isPayloadTooLarge(request: Request): boolean {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  return contentLength > MAX_INGEST_PAYLOAD_BYTES;
}

export class PayloadTooLargeError extends Error {}

// Reads and parses the request body while counting bytes as they stream in,
// aborting as soon as the cap is exceeded — unlike isPayloadTooLarge, this
// can't be defeated by a missing or understated Content-Length header, since
// it's counting what actually arrives rather than trusting what the client
// claims up front.
export async function readJsonWithLimit(request: Request, maxBytes: number): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return request.json();

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new PayloadTooLargeError(`Body exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }

  const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
  return JSON.parse(text);
}
