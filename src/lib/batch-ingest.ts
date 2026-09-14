import { createHash } from "crypto";
import { prisma } from "./prisma";
import { enqueueFindingsNotification } from "./notify";
import { severityMeetsThreshold } from "./severity";
import {
  initialOpenIntervals,
  isOpenStatus,
  parseOpenIntervals,
  reopenOpenIntervals,
  resolveOpenIntervals,
  type FindingStatus,
} from "./finding-lifecycle";

// Generic batch-scan ingestion: one full result set per run (CI job, cron
// hit, etc.), diffed against the project's existing open findings for this
// tool — new findings are created, previously-resolved ones reopen, and open
// findings missing from this payload resolve. Extracted from the original
// Trivy ingest route (src/app/api/ingest/trivy/route.ts) so every batch-shape
// tool (Semgrep, gitleaks, license/IaC/kube-bench/Cloudsplaining, ...) shares
// one implementation of this diff instead of re-deriving it per tool.
//
// Unlike Trivy, callers here always populate `dedupeKey` from day one (no
// legacy null-dedupeKey rows to reconcile), so the null-key fallback matching
// in the Trivy route isn't needed here — every match is a plain dedupeKey
// lookup.
export type BatchFindingInput = {
  severity: string;
  title: string;
  description: string | null;
  resource: string | null;
  fixedVersion: string | null;
  ruleName: string | null;
  dedupeKey: string;
};

export type BatchScanMeta = {
  repo?: string;
  branch?: string;
  commitSha?: string;
  pipelineId?: string;
};

export type BatchScanResult = {
  scanId: string;
  deduped: boolean;
  findingsCount: number;
  created: number;
  reopened: number;
  stillOpen: number;
  resolved: number;
};

export async function processBatchScan(params: {
  tool: string;
  projectId: string;
  idempotencyKey: string;
  meta?: BatchScanMeta;
  rawPayload: unknown;
  findings: BatchFindingInput[];
}): Promise<BatchScanResult> {
  const { tool, projectId, idempotencyKey, meta, rawPayload, findings } = params;

  // Exact same run retried (e.g. CI/cron retry) — do not reopen/resolve again.
  const existingScan = await prisma.scan.findUnique({ where: { idempotencyKey } });
  if (existingScan) {
    return { scanId: existingScan.id, deduped: true, findingsCount: 0, created: 0, reopened: 0, stillOpen: 0, resolved: 0 };
  }

  const uniqueByKey = new Map<string, BatchFindingInput>();
  for (const f of findings) {
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
          where: { projectId, tool, dedupeKey: { in: payloadKeys } },
        });
  const existingByKey = new Map(existingFindings.map((f) => [f.dedupeKey as string, f]));

  const toCreate: BatchFindingInput[] = [];
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

  // Every element of uniqueFindings landed in exactly one of
  // toCreate/toReopen/stillOpen above, so this scan's overall severity is
  // just whether any incoming finding (new or already-known) is critical.
  const hasCritical = uniqueFindings.some((f) => f.severity === "critical");

  const scan = await prisma.scan.create({
    data: {
      projectId,
      source: tool,
      repo: meta?.repo ?? null,
      pipelineId: meta?.pipelineId ?? null,
      branch: meta?.branch ?? null,
      commitSha: meta?.commitSha ?? null,
      status: hasCritical ? "warning" : "success",
      idempotencyKey,
      rawPayload: rawPayload as object,
    },
    include: { project: { include: { notifyConfig: true } } },
  });

  if (toCreate.length > 0) {
    await prisma.finding.createMany({
      data: toCreate.map((f) => ({
        ...f,
        tool,
        scanId: scan.id,
        projectId,
        status: "opened" satisfies FindingStatus,
        openIntervals: initialOpenIntervals(now),
        detectedAt: now,
      })),
      skipDuplicates: true,
    });
  }

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
        ruleName: incoming.ruleName,
      },
    });
  }

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
        ruleName: incoming.ruleName,
      },
    });
  }

  const observedFindings =
    payloadKeys.length === 0
      ? []
      : await prisma.finding.findMany({
          where: { projectId, tool, dedupeKey: { in: payloadKeys } },
          select: { id: true },
        });
  if (observedFindings.length > 0) {
    await prisma.scanFinding.createMany({
      data: observedFindings.map((f) => ({ scanId: scan.id, findingId: f.id, observedAt: now })),
      skipDuplicates: true,
    });
  }

  // Any open finding for this (project, tool) missing from this payload → resolved.
  const openInProject = await prisma.finding.findMany({
    where: { projectId, tool, status: { in: ["opened", "reopened"] } },
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
              ...(toCreate.length ? [{ projectId, tool, dedupeKey: { in: toCreate.map((f) => f.dedupeKey) } }] : []),
              ...(toReopen.length ? [{ id: { in: toReopen.map((f) => f.id) } }] : []),
            ],
          },
        });

  const notifyConfig = scan.project.notifyConfig;
  if (notifyConfig) {
    const toNotify = createdOnThisScan.filter((f) => severityMeetsThreshold(f.severity, notifyConfig.severityThreshold));
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

  return {
    scanId: scan.id,
    deduped: false,
    findingsCount: observedFindings.length,
    created: toCreate.length,
    reopened: toReopen.length,
    stillOpen: stillOpen.length,
    resolved: resolvedCount,
  };
}

export function contentHashIdempotencyKey(tool: string, projectId: string, payload: unknown): string {
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return `${tool}:${projectId}:content:${hash}`;
}

export function ciRunIdempotencyKey(tool: string, projectId: string, meta: BatchScanMeta): string | null {
  if (meta.repo && meta.commitSha) {
    return `${tool}:${projectId}:${meta.repo}:${meta.commitSha}:${meta.pipelineId ?? ""}`;
  }
  return null;
}
