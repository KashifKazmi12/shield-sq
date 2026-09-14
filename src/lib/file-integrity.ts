import { createHash } from "crypto";
import { z } from "zod";
import { FALCO_SCAN_BUCKET_MINUTES } from "./constants";

// A single AIDE/OSSEC file-integrity alert. Both tools report roughly the
// same shape (path, kind of change, host, timestamp) — like Falco, this is
// event-stream shaped: alerts arrive continuously from an agent, not as one
// full batch per run, so it reuses the Falco route's time-bucketed Scan
// pattern rather than the Trivy-shaped batch diff in batch-ingest.ts.
const fileIntegrityAlertSchema = z.object({
  path: z.string(),
  changeType: z.enum(["added", "modified", "removed", "permissions"]),
  hostname: z.string().optional(),
  hash: z.string().optional(),
  time: z.string().optional(),
  rule: z.string().optional(), // AIDE rule name / OSSEC rule id, if the agent reports one
});

export type FileIntegrityAlert = z.infer<typeof fileIntegrityAlertSchema>;

export class FileIntegrityPayloadError extends Error {}

export function parseFileIntegrityPayload(body: unknown): FileIntegrityAlert {
  const result = fileIntegrityAlertSchema.safeParse(body);
  if (!result.success) {
    throw new FileIntegrityPayloadError("Body must be a file-integrity alert with `path` and `changeType` fields");
  }
  return result.data;
}

export function parseFileIntegrityBatch(body: unknown): FileIntegrityAlert[] {
  if (Array.isArray(body)) {
    const result = z.array(fileIntegrityAlertSchema).safeParse(body);
    if (!result.success) {
      throw new FileIntegrityPayloadError("Every item in the array must be a file-integrity alert with `path` and `changeType` fields");
    }
    return result.data;
  }
  return [parseFileIntegrityPayload(body)];
}

export function fileIntegrityDedupeKey(alert: FileIntegrityAlert): string {
  const hash = createHash("sha256")
    .update(`${alert.hostname ?? ""}|${alert.path}|${alert.changeType}|${alert.time ?? ""}`)
    .digest("hex");
  return `file-integrity:${hash}`;
}

// A removed/modified system file is worth more attention than a permissions
// tweak, but there's no universal severity in AIDE/OSSEC's own output — this
// is our own classification, same role as normalizeFalcoPriority in severity.ts.
export function severityForChangeType(changeType: FileIntegrityAlert["changeType"]): string {
  switch (changeType) {
    case "removed":
      return "critical";
    case "modified":
      return "high";
    case "added":
      return "medium";
    default:
      return "low";
  }
}

// Same rolling-bucket idea as falcoBucketStart/falcoScanIdempotencyKey in
// falco.ts, reusing the existing FALCO_SCAN_BUCKET_MINUTES knob rather than
// adding a second env var for what's the same "how often do event-stream
// alerts get grouped into one Scan row" behavior.
export function fileIntegrityBucketStart(at: Date = new Date()): Date {
  const bucketMs = FALCO_SCAN_BUCKET_MINUTES * 60_000;
  return new Date(Math.floor(at.getTime() / bucketMs) * bucketMs);
}

export function fileIntegrityScanIdempotencyKey(projectId: string, bucketStart: Date): string {
  return `file-integrity:${projectId}:${bucketStart.toISOString()}`;
}
