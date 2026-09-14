import { NextResponse } from "next/server";
import { authenticateIngestRequest, ingestAuthErrorResponse, isPayloadTooLarge, readJsonWithLimit, PayloadTooLargeError } from "@/lib/ingest-auth";
import { logRejectedIngest } from "@/lib/audit";
import { MAX_INGEST_PAYLOAD_BYTES } from "@/lib/constants";
import { parseSemgrepPayload, extractSemgrepFindings, SemgrepPayloadError } from "@/lib/semgrep";
import { processBatchScan, ciRunIdempotencyKey, contentHashIdempotencyKey } from "@/lib/batch-ingest";

const TOOL = "semgrep";

export async function POST(request: Request) {
  const auth = await authenticateIngestRequest(request);
  if (!auth.ok) {
    await logRejectedIngest({ source: TOOL, reason: auth.reason, detail: auth.detail });
    return ingestAuthErrorResponse(auth);
  }

  if (isPayloadTooLarge(request)) {
    await logRejectedIngest({ source: TOOL, projectId: auth.projectId, reason: "payload_too_large" });
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await readJsonWithLimit(request, MAX_INGEST_PAYLOAD_BYTES);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      await logRejectedIngest({ source: TOOL, projectId: auth.projectId, reason: "payload_too_large" });
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    await logRejectedIngest({ source: TOOL, projectId: auth.projectId, reason: "malformed_json" });
    return NextResponse.json({ error: "malformed_json" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseSemgrepPayload(body);
  } catch (err) {
    const detail = err instanceof SemgrepPayloadError ? err.message : "Invalid Semgrep payload";
    await logRejectedIngest({ source: TOOL, projectId: auth.projectId, reason: "malformed_payload", detail });
    return NextResponse.json({ error: "malformed_payload", detail }, { status: 422 });
  }

  const idempotencyKey =
    ciRunIdempotencyKey(TOOL, auth.projectId, parsed.meta) ?? contentHashIdempotencyKey(TOOL, auth.projectId, parsed.report);

  const result = await processBatchScan({
    tool: TOOL,
    projectId: auth.projectId,
    idempotencyKey,
    meta: parsed.meta,
    rawPayload: body,
    findings: extractSemgrepFindings(parsed.report),
  });

  return NextResponse.json(result, { status: result.deduped ? 200 : 201 });
}
