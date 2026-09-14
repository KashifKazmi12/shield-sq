import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateIngestRequest, ingestAuthErrorResponse, isPayloadTooLarge, readJsonWithLimit, PayloadTooLargeError } from "@/lib/ingest-auth";
import { logRejectedIngest } from "@/lib/audit";
import { MAX_INGEST_PAYLOAD_BYTES } from "@/lib/constants";
import {
  parseFileIntegrityBatch,
  fileIntegrityDedupeKey,
  fileIntegrityBucketStart,
  fileIntegrityScanIdempotencyKey,
  severityForChangeType,
  FileIntegrityPayloadError,
  type FileIntegrityAlert,
} from "@/lib/file-integrity";
import { severityMeetsThreshold } from "@/lib/severity";
import { enqueueFindingsNotification, type NotifyPayload } from "@/lib/notify";
import { initialOpenIntervals } from "@/lib/finding-lifecycle";

const TOOL = "file-integrity";

type ProcessResult = {
  scanId: string;
  findingId: string | undefined;
  deduped: boolean;
  notify: NotifyPayload | null;
};

// Event-stream shaped, same as Falco's processFalcoAlert: one alert becomes
// one Finding, grouped into a rolling time-bucketed Scan since AIDE/OSSEC
// alerts (like Falco's) have no pipeline/run boundary of their own.
async function processFileIntegrityAlert(alert: FileIntegrityAlert, projectId: string): Promise<ProcessResult> {
  const alertTime = alert.time ? new Date(alert.time) : new Date();
  const bucketStart = fileIntegrityBucketStart(alertTime);
  const scanIdempotencyKey = fileIntegrityScanIdempotencyKey(projectId, bucketStart);
  const severity = severityForChangeType(alert.changeType);
  const dedupeKey = fileIntegrityDedupeKey(alert);

  const scan = await prisma.scan.upsert({
    where: { idempotencyKey: scanIdempotencyKey },
    create: {
      projectId,
      source: TOOL,
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
        tool: TOOL,
        severity,
        title: `File ${alert.changeType}: ${alert.path}`,
        description: alert.hash ? `New hash: ${alert.hash}` : null,
        resource: alert.hostname ?? null,
        ruleName: alert.rule ?? null,
        dedupeKey,
        detectedAt: alertTime,
        status: "opened",
        openIntervals: initialOpenIntervals(alertTime),
      },
    });

    await prisma.scanFinding.create({
      data: { scanId: scan.id, findingId: finding.id, observedAt: alertTime },
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
      const existingFinding = await prisma.finding.findUnique({
        where: { projectId_dedupeKey: { projectId, dedupeKey } },
      });
      if (existingFinding) {
        await prisma.scanFinding.createMany({
          data: [{ scanId: scan.id, findingId: existingFinding.id, observedAt: alertTime }],
          skipDuplicates: true,
        });
      }
      return { scanId: scan.id, findingId: existingFinding?.id, deduped: true, notify: null };
    }
    throw err;
  }
}

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

  let alerts;
  try {
    alerts = parseFileIntegrityBatch(body);
  } catch (err) {
    const detail = err instanceof FileIntegrityPayloadError ? err.message : "Invalid file-integrity payload";
    await logRejectedIngest({ source: TOOL, projectId: auth.projectId, reason: "malformed_payload", detail });
    return NextResponse.json({ error: "malformed_payload", detail }, { status: 422 });
  }

  // Sequential, not Promise.all — same reasoning as the Falco route: alerts
  // in the same bucket share a Scan row via upsert, and concurrent upserts
  // of a not-yet-existing row would race each other.
  const results: ProcessResult[] = [];
  for (const alert of alerts) {
    results.push(await processFileIntegrityAlert(alert, auth.projectId));
  }

  const project = await prisma.project.findUnique({ where: { id: auth.projectId }, include: { notifyConfig: true } });
  const toNotify = results.map((r) => r.notify).filter((n): n is NotifyPayload => n !== null);
  await enqueueFindingsNotification(toNotify, project?.notifyConfig ?? null);

  const responses = results.map(({ scanId, findingId, deduped }) => ({ scanId, findingId, deduped }));

  if (!Array.isArray(body)) {
    return NextResponse.json(responses[0], { status: responses[0].deduped ? 200 : 201 });
  }
  const allDeduped = responses.every((r) => r.deduped);
  return NextResponse.json({ results: responses }, { status: allDeduped ? 200 : 201 });
}
