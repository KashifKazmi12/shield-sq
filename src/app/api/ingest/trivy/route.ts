import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateIngestRequest, ingestAuthErrorResponse, isPayloadTooLarge, readJsonWithLimit, PayloadTooLargeError } from "@/lib/ingest-auth";
import { logRejectedIngest } from "@/lib/audit";
import {
  parseTrivyPayload,
  trivyIdempotencyKey,
  extractTrivyFindings,
  trivyDedupeKeyFromStoredFinding,
  TrivyPayloadError,
} from "@/lib/trivy";
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

  // Include null-key rows so older findings (created before dedupeKey was
  // written) can still match by reconstructed identity — otherwise every
  // scan resolves them and inserts duplicates.
  const existingFindings =
    payloadKeys.length === 0
      ? []
      : await prisma.finding.findMany({
          where: {
            projectId: auth.projectId,
            tool: "trivy",
            OR: [{ dedupeKey: { in: payloadKeys } }, { dedupeKey: null }],
          },
        });

  const existingByKey = new Map<string, (typeof existingFindings)[number]>();
  for (const f of existingFindings) {
    if (f.dedupeKey) existingByKey.set(f.dedupeKey, f);
  }
  const nullKeyFindings = existingFindings
    .filter((f) => !f.dedupeKey)
    .sort((a, b) => {
      const aOpen = isOpenStatus(a.status) ? 0 : 1;
      const bOpen = isOpenStatus(b.status) ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      return b.detectedAt.getTime() - a.detectedAt.getTime();
    });
  for (const f of nullKeyFindings) {
    const key = trivyDedupeKeyFromStoredFinding(f.title, f.resource);
    if (!existingByKey.has(key)) existingByKey.set(key, f);
  }

  const toCreate: typeof uniqueFindings = [];
  const toReopen: Array<(typeof existingFindings)[number]> = [];
  const stillOpen: Array<(typeof existingFindings)[number]> = [];
  const matchedIds = new Set<string>();

  for (const f of uniqueFindings) {
    const existing = existingByKey.get(f.dedupeKey);
    if (!existing) {
      toCreate.push(f);
    } else if (!isOpenStatus(existing.status)) {
      toReopen.push(existing);
      matchedIds.add(existing.id);
    } else {
      stillOpen.push(existing);
      matchedIds.add(existing.id);
    }
  }

  const hasCritical =
    toCreate.some((f) => f.severity === "critical") ||
    [...toReopen, ...stillOpen].some((f) => {
      const key = f.dedupeKey ?? trivyDedupeKeyFromStoredFinding(f.title, f.resource);
      const incoming = uniqueByKey.get(key);
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
  // Also persist dedupeKey when the matched row still has null (legacy rows).
  for (const existing of stillOpen) {
    const key = existing.dedupeKey ?? trivyDedupeKeyFromStoredFinding(existing.title, existing.resource);
    const incoming = uniqueByKey.get(key);
    if (!incoming) continue;
    await prisma.finding.update({
      where: { id: existing.id },
      data: {
        dedupeKey: incoming.dedupeKey,
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
    const key = existing.dedupeKey ?? trivyDedupeKeyFromStoredFinding(existing.title, existing.resource);
    const incoming = uniqueByKey.get(key);
    if (!incoming) continue;
    const intervals = reopenOpenIntervals(parseOpenIntervals(existing.openIntervals), now);
    await prisma.finding.update({
      where: { id: existing.id },
      data: {
        dedupeKey: incoming.dedupeKey,
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
    if (matchedIds.has(finding.id)) continue;
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
