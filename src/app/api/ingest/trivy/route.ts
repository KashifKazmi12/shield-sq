import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateIngestRequest, ingestAuthErrorResponse, isPayloadTooLarge, readJsonWithLimit, PayloadTooLargeError } from "@/lib/ingest-auth";
import { logRejectedIngest } from "@/lib/audit";
import { parseTrivyPayload, trivyIdempotencyKey, extractTrivyFindings, TrivyPayloadError } from "@/lib/trivy";
import { enqueueFindingsNotification } from "@/lib/notify";
import { severityMeetsThreshold } from "@/lib/severity";
import { MAX_INGEST_PAYLOAD_BYTES } from "@/lib/constants";
import {
  initialOpenIntervals,
  isOpenStatus,
  parseOpenIntervals,
  reopenOpenIntervals,
  resolveOpenIntervals,
  type FindingStatus,
} from "@/lib/finding-lifecycle";

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

  // Exact same CI run retry — do not reopen/resolve again.
  const existingScan = await prisma.scan.findUnique({ where: { idempotencyKey } });
  if (existingScan) {
    return NextResponse.json({ scanId: existingScan.id, deduped: true }, { status: 200 });
  }

  const findingsInput = extractTrivyFindings(parsed.report);
  const uniqueByKey = new Map<string, (typeof findingsInput)[number]>();
  for (const f of findingsInput) {
    if (!uniqueByKey.has(f.dedupeKey)) uniqueByKey.set(f.dedupeKey, f);
  }
  const uniqueFindings = [...uniqueByKey.values()];
  const payloadKeys = uniqueFindings.map((f) => f.dedupeKey);
  const payloadKeySet = new Set(payloadKeys);
  const now = new Date();

  const existingFindings =
    payloadKeys.length === 0
      ? []
      : await prisma.finding.findMany({
          where: { projectId: auth.projectId, tool: "trivy", dedupeKey: { in: payloadKeys } },
        });
  const existingByKey = new Map(
    existingFindings.filter((f) => f.dedupeKey).map((f) => [f.dedupeKey!, f])
  );

  const toCreate: typeof uniqueFindings = [];
  const toReopen: typeof existingFindings = [];
  const stillOpen: typeof existingFindings = [];

  for (const f of uniqueFindings) {
    const existing = existingByKey.get(f.dedupeKey);
    if (!existing) {
      toCreate.push(f);
    } else if (!isOpenStatus(existing.status)) {
      toReopen.push(existing);
    } else {
      stillOpen.push(existing);
    }
  }

  const hasCritical =
    toCreate.some((f) => f.severity === "critical") ||
    [...toReopen, ...stillOpen].some((f) => {
      const incoming = uniqueByKey.get(f.dedupeKey!);
      return (incoming?.severity ?? f.severity) === "critical";
    });

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
    },
    include: { project: { include: { notifyConfig: true } } },
  });

  if (toCreate.length > 0) {
    await prisma.finding.createMany({
      data: toCreate.map((f) => ({
        ...f,
        scanId: scan.id,
        projectId: auth.projectId,
        status: "opened" satisfies FindingStatus,
        openIntervals: initialOpenIntervals(now),
        detectedAt: now,
      })),
      skipDuplicates: true,
    });
  }

  // Still open: refresh metadata only — do NOT move Finding.scanId (first-seen).
  for (const existing of stillOpen) {
    const incoming = uniqueByKey.get(existing.dedupeKey!);
    if (!incoming) continue;
    await prisma.finding.update({
      where: { id: existing.id },
      data: {
        severity: incoming.severity,
        title: incoming.title,
        description: incoming.description,
        resource: incoming.resource,
        fixedVersion: incoming.fixedVersion,
      },
    });
  }

  // Previously resolved, seen again → reopened (keep original scanId).
  for (const existing of toReopen) {
    const incoming = uniqueByKey.get(existing.dedupeKey!);
    if (!incoming) continue;
    const intervals = reopenOpenIntervals(parseOpenIntervals(existing.openIntervals), now);
    await prisma.finding.update({
      where: { id: existing.id },
      data: {
        status: "reopened" satisfies FindingStatus,
        openIntervals: intervals,
        severity: incoming.severity,
        title: incoming.title,
        description: incoming.description,
        resource: incoming.resource,
        fixedVersion: incoming.fixedVersion,
      },
    });
  }

  // Link every payload finding to this scan (immutable run snapshot).
  const observedFindings = await prisma.finding.findMany({
    where: {
      projectId: auth.projectId,
      tool: "trivy",
      dedupeKey: { in: payloadKeys },
    },
    select: { id: true },
  });
  if (observedFindings.length > 0) {
    await prisma.scanFinding.createMany({
      data: observedFindings.map((f) => ({
        scanId: scan.id,
        findingId: f.id,
        observedAt: now,
      })),
      skipDuplicates: true,
    });
  }

  // Option A: any open Trivy finding for this project missing from the payload → resolved.
  const openInProject = await prisma.finding.findMany({
    where: {
      projectId: auth.projectId,
      tool: "trivy",
      status: { in: ["opened", "reopened"] },
    },
    select: { id: true, dedupeKey: true, openIntervals: true },
  });

  let resolvedCount = 0;
  for (const finding of openInProject) {
    if (finding.dedupeKey && payloadKeySet.has(finding.dedupeKey)) continue;
    await prisma.finding.update({
      where: { id: finding.id },
      data: {
        status: "resolved" satisfies FindingStatus,
        openIntervals: resolveOpenIntervals(parseOpenIntervals(finding.openIntervals), now),
      },
    });
    resolvedCount++;
  }

  const createdOnThisScan =
    toCreate.length === 0 && toReopen.length === 0
      ? []
      : await prisma.finding.findMany({
          where: {
            OR: [
              ...(toCreate.length
                ? [{ projectId: auth.projectId, tool: "trivy" as const, dedupeKey: { in: toCreate.map((f) => f.dedupeKey) } }]
                : []),
              ...(toReopen.length ? [{ id: { in: toReopen.map((f) => f.id) } }] : []),
            ],
          },
        });

  const notifyConfig = scan.project.notifyConfig;
  if (notifyConfig) {
    const toNotify = createdOnThisScan.filter((f) =>
      severityMeetsThreshold(f.severity, notifyConfig.severityThreshold)
    );
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

  return NextResponse.json(
    {
      scanId: scan.id,
      findingsCount: observedFindings.length,
      created: toCreate.length,
      reopened: toReopen.length,
      stillOpen: stillOpen.length,
      resolved: resolvedCount,
      skippedExisting: stillOpen.length + toReopen.length,
    },
    { status: 201 }
  );
}
