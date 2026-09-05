import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateIngestRequest, ingestAuthErrorResponse, isPayloadTooLarge, readJsonWithLimit, PayloadTooLargeError } from "@/lib/ingest-auth";
import { logRejectedIngest } from "@/lib/audit";
import { MAX_INGEST_PAYLOAD_BYTES } from "@/lib/constants";
import {
  parseFalcoBatch,
  falcoDedupeKey,
  falcoBucketStart,
  falcoScanIdempotencyKey,
  extractResource,
  FalcoPayloadError,
  type FalcoAlert,
} from "@/lib/falco";
import { normalizeFalcoPriority, severityMeetsThreshold } from "@/lib/severity";
import { enqueueFindingsNotification, type NotifyPayload } from "@/lib/notify";
import { initialOpenIntervals } from "@/lib/finding-lifecycle";

type ProcessResult = {
  scanId: string;
  findingId: string | undefined;
  deduped: boolean;
  notify: NotifyPayload | null;
};

async function processFalcoAlert(alert: FalcoAlert, projectId: string): Promise<ProcessResult> {
  const alertTime = alert.time ? new Date(alert.time) : new Date();
  const bucketStart = falcoBucketStart(alertTime);
  const scanIdempotencyKey = falcoScanIdempotencyKey(projectId, bucketStart);
  const severity = normalizeFalcoPriority(alert.priority);
  const dedupeKey = falcoDedupeKey(alert);

  const scan = await prisma.scan.upsert({
    where: { idempotencyKey: scanIdempotencyKey },
    create: {
      projectId,
      source: "falco",
      status: "warning",
      idempotencyKey: scanIdempotencyKey,
      rawPayload: { bucketStart: bucketStart.toISOString() },
    },
    update: {},
    include: { project: { include: { notifyConfig: true } } },
  });

  try {
    const finding = await prisma.finding.create({
      data: {
        scanId: scan.id,
        projectId,
        tool: "falco",
        severity,
        title: alert.rule,
        description: alert.output ?? null,
        resource: extractResource({
          output_fields: alert.output_fields as Record<string, unknown> | undefined,
          hostname: alert.hostname,
        }),
        ruleName: alert.rule,
        dedupeKey,
        detectedAt: alertTime,
        status: "opened",
        openIntervals: initialOpenIntervals(alertTime),
      },
    });

    const notifyConfig = scan.project.notifyConfig;
    const shouldNotify = notifyConfig && severityMeetsThreshold(severity, notifyConfig.severityThreshold);

    return {
      scanId: scan.id,
      findingId: finding.id,
      deduped: false,
      notify: shouldNotify
        ? {
            findingId: finding.id,
            projectName: scan.project.name,
            title: finding.title,
            severity: finding.severity,
            description: finding.description,
          }
        : null,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Same alert delivered twice (webhook retry) — treat as the successful,
      // already-processed case rather than erroring. Scoped to this project:
      // dedupeKey alone isn't unique any more (see schema.prisma), so this
      // can never resolve to a different project's finding.
      const existingFinding = await prisma.finding.findUnique({
        where: { projectId_dedupeKey: { projectId, dedupeKey: dedupeKey! } },
      });
      return { scanId: scan.id, findingId: existingFinding?.id, deduped: true, notify: null };
    }
    throw err;
  }
}

export async function POST(request: Request) {
  const auth = await authenticateIngestRequest(request);
  if (!auth.ok) {
    await logRejectedIngest({ source: "falco", reason: auth.reason, detail: auth.detail });
    return ingestAuthErrorResponse(auth);
  }

  if (isPayloadTooLarge(request)) {
    await logRejectedIngest({ source: "falco", projectId: auth.projectId, reason: "payload_too_large" });
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await readJsonWithLimit(request, MAX_INGEST_PAYLOAD_BYTES);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      await logRejectedIngest({ source: "falco", projectId: auth.projectId, reason: "payload_too_large" });
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    await logRejectedIngest({ source: "falco", projectId: auth.projectId, reason: "malformed_json" });
    return NextResponse.json({ error: "malformed_json" }, { status: 400 });
  }

  let alerts;
  try {
    alerts = parseFalcoBatch(body);
  } catch (err) {
    const detail = err instanceof FalcoPayloadError ? err.message : "Invalid Falco payload";
    await logRejectedIngest({ source: "falco", projectId: auth.projectId, reason: "malformed_payload", detail });
    return NextResponse.json({ error: "malformed_payload", detail }, { status: 422 });
  }

  // Sequential, not Promise.all — alerts in the same hourly bucket share a
  // Scan row via upsert, and concurrent upserts of a not-yet-existing row
  // would race each other.
  const results: ProcessResult[] = [];
  for (const alert of alerts) {
    results.push(await processFalcoAlert(alert, auth.projectId));
  }

  // One notification for the whole request, not one per alert — a batch of
  // 30 alerts sends 1 Slack message, not 30.
  const project = await prisma.project.findUnique({ where: { id: auth.projectId }, include: { notifyConfig: true } });
  const toNotify = results.map((r) => r.notify).filter((n): n is NotifyPayload => n !== null);
  await enqueueFindingsNotification(toNotify, project?.notifyConfig ?? null);

  const responses = results.map(({ scanId, findingId, deduped }) => ({ scanId, findingId, deduped }));

  // A single alert (the common Falcosidekick case) keeps the original flat
  // response shape; an array input gets an array of results back.
  if (!Array.isArray(body)) {
    return NextResponse.json(responses[0], { status: responses[0].deduped ? 200 : 201 });
  }
  const allDeduped = responses.every((r) => r.deduped);
  return NextResponse.json({ results: responses }, { status: allDeduped ? 200 : 201 });
}
