import { createHash } from "crypto";
import { z } from "zod";
import { normalizeFalcoPriority } from "./severity";
import { FALCO_SCAN_BUCKET_MINUTES } from "./constants";

const falcoAlertSchema = z.object({
  uuid: z.string().optional(),
  rule: z.string(),
  priority: z.string().optional(),
  output: z.string().optional(),
  time: z.string().optional(),
  output_fields: z.record(z.unknown()).optional(),
  // Present on a bare-VM/host Falco deployment (no Kubernetes) — the alert
  // still needs to identify *where* it happened even without k8s.* fields.
  hostname: z.string().optional(),
});

export type FalcoAlert = z.infer<typeof falcoAlertSchema>;

export class FalcoPayloadError extends Error {}

export function parseFalcoPayload(body: unknown): FalcoAlert {
  const result = falcoAlertSchema.safeParse(body);
  if (!result.success) {
    throw new FalcoPayloadError("Body must be a Falcosidekick alert payload with a `rule` field");
  }
  return result.data;
}

// Falcosidekick's default webhook output posts one alert per request, but
// some forwarders (or a custom batching config) post a JSON array of alerts
// in one call instead. Accept both shapes rather than forcing every client
// to unwrap a single-element array.
export function parseFalcoBatch(body: unknown): FalcoAlert[] {
  if (Array.isArray(body)) {
    const result = z.array(falcoAlertSchema).safeParse(body);
    if (!result.success) {
      throw new FalcoPayloadError("Every item in the array must be a Falcosidekick alert payload with a `rule` field");
    }
    return result.data;
  }
  return [parseFalcoPayload(body)];
}

export function falcoDedupeKey(alert: FalcoAlert): string {
  if (alert.uuid) return `falco:uuid:${alert.uuid}`;
  const hash = createHash("sha256")
    .update(`${alert.rule}|${alert.output ?? ""}|${alert.time ?? ""}`)
    .digest("hex");
  return `falco:content:${hash}`;
}

// One rolling Scan per project per FALCO_SCAN_BUCKET_MINUTES window, since
// Falco alerts have no inherent pipeline/run boundary to group by.
export function falcoBucketStart(at: Date = new Date()): Date {
  const bucketMs = FALCO_SCAN_BUCKET_MINUTES * 60_000;
  return new Date(Math.floor(at.getTime() / bucketMs) * bucketMs);
}

export function falcoScanIdempotencyKey(projectId: string, bucketStart: Date): string {
  return `falco:${projectId}:${bucketStart.toISOString()}`;
}

// Prefers Kubernetes-shaped output_fields (ns/pod/container) when present —
// the common case for a Falcosidekick + Kubernetes deployment. Falls back to
// the alert's bare hostname for a non-Kubernetes/VM-based Falco deployment,
// which has no k8s.* fields at all but still needs to say *where* an alert
// happened, not just what rule fired.
export function extractResource(alert: {
  output_fields?: Record<string, unknown>;
  hostname?: string;
}): string | null {
  const fields = alert.output_fields;
  const pod = fields?.["k8s.pod.name"];
  const ns = fields?.["k8s.ns.name"];
  const container = fields?.["container.name"] ?? fields?.["container.id"];
  const parts = [ns, pod, container].filter(Boolean);
  if (parts.length) return parts.join("/");
  return alert.hostname ?? null;
}
