import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateIngestRequest, ingestAuthErrorResponse, isPayloadTooLarge, readJsonWithLimit, PayloadTooLargeError } from "@/lib/ingest-auth";
import { logRejectedIngest } from "@/lib/audit";
import { parseTrivyPayload, trivyIdempotencyKey, extractTrivyFindings, TrivyPayloadError } from "@/lib/trivy";
import { enqueueFindingsNotification } from "@/lib/notify";
import { severityMeetsThreshold } from "@/lib/severity";
import { MAX_INGEST_PAYLOAD_BYTES } from "@/lib/constants";

export async function POST(request: Request) {
  const auth = await authenticateIngestRequest(request);
  if (!auth.ok) {
    await logRejectedIngest({ source: "trivy", reason: auth.reason, detail: auth.detail });
    return ingestAuthErrorResponse(auth);
  }

  if (isPayloadTooLarge(request)) {
    await logRejectedIngest({ source: "trivy", projectId: auth.projectId, reason: "payload_too_large" });
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await readJsonWithLimit(request, MAX_INGEST_PAYLOAD_BYTES);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      await logRejectedIngest({ source: "trivy", projectId: auth.projectId, reason: "payload_too_large" });
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    await logRejectedIngest({ source: "trivy", projectId: auth.projectId, reason: "malformed_json" });
    return NextResponse.json({ error: "malformed_json" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseTrivyPayload(body);
  } catch (err) {
    const detail = err instanceof TrivyPayloadError ? err.message : "Invalid Trivy payload";
    await logRejectedIngest({ source: "trivy", projectId: auth.projectId, reason: "malformed_payload", detail });
    return NextResponse.json({ error: "malformed_payload", detail }, { status: 422 });
  }

  const idempotencyKey = trivyIdempotencyKey(auth.projectId, parsed);

  const existing = await prisma.scan.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return NextResponse.json({ scanId: existing.id, deduped: true }, { status: 200 });
  }

  const findingsInput = extractTrivyFindings(parsed.report);
  const hasCritical = findingsInput.some((f) => f.severity === "critical");

  const scan = await prisma.scan.create({
    data: {
      projectId: auth.projectId,
      source: "trivy",
      repo: parsed.meta.repo,
      pipelineId: parsed.meta.pipelineId,
      branch: parsed.meta.branch,
      commitSha: parsed.meta.commitSha,
      status: hasCritical ? "warning" : "success",
      idempotencyKey,
      rawPayload: body as object,
      findings: {
        create: findingsInput.map((f) => ({ ...f, projectId: auth.projectId })),
      },
    },
    include: { findings: true, project: { include: { notifyConfig: true } } },
  });

  const notifyConfig = scan.project.notifyConfig;
  if (notifyConfig) {
    const toNotify = scan.findings.filter((f) => severityMeetsThreshold(f.severity, notifyConfig.severityThreshold));
    await enqueueFindingsNotification(
      toNotify.map((f) => ({
        findingId: f.id,
        projectName: scan.project.name,
        title: f.title,
        severity: f.severity,
        description: f.description,
      })),
      notifyConfig
    );
  }

  return NextResponse.json({ scanId: scan.id, findingsCount: scan.findings.length }, { status: 201 });
}
