import { z } from "zod";
import type { BatchFindingInput } from "./batch-ingest";

// Cloudsplaining's `--output json` scan-results shape: a dict keyed by IAM
// principal ARN, each holding a findings array with a risk type + actions.
const findingSchema = z.object({
  type: z.string(), // e.g. "PrivilegeEscalation", "ResourceExposure", "DataExfiltration"
  PolicyName: z.string().optional(),
  actions: z.array(z.string()).optional(),
});

const principalEntrySchema = z.object({
  findings: z.array(findingSchema).optional(),
});

const rawSchema = z.record(principalEntrySchema);

const metaSchema = z.object({
  repo: z.string().optional(),
  branch: z.string().optional(),
  commitSha: z.string().optional(),
  pipelineId: z.string().optional(),
  account: z.string().optional(),
});

const wrapperSchema = z.object({ meta: metaSchema, results: rawSchema });

export type ParsedCloudsplainingPayload = {
  meta: z.infer<typeof metaSchema>;
  report: z.infer<typeof rawSchema>;
};

export class CloudsplainingPayloadError extends Error {}

export function parseCloudsplainingPayload(body: unknown): ParsedCloudsplainingPayload {
  const asWrapper = wrapperSchema.safeParse(body);
  if (asWrapper.success) return { meta: asWrapper.data.meta, report: asWrapper.data.results };

  const asRaw = rawSchema.safeParse(body);
  if (asRaw.success) return { meta: {}, report: asRaw.data };

  throw new CloudsplainingPayloadError("Body must be Cloudsplaining `--output json` scan results or a { meta, results } wrapper");
}

const HIGH_RISK_TYPES = new Set(["PrivilegeEscalation", "ResourceExposure", "DataExfiltration"]);

function severityForFindingType(type: string): string {
  return HIGH_RISK_TYPES.has(type) ? "critical" : "medium";
}

export function cloudsplainingDedupeKey(principalArn: string, findingType: string, policyName: string | undefined): string {
  return `cloudsplaining:${principalArn}:${findingType}:${policyName ?? ""}`;
}

export function extractCloudsplainingFindings(report: ParsedCloudsplainingPayload["report"]): BatchFindingInput[] {
  const findings: BatchFindingInput[] = [];
  for (const [principalArn, entry] of Object.entries(report)) {
    for (const f of entry.findings ?? []) {
      findings.push({
        severity: severityForFindingType(f.type),
        title: `${f.type} risk on ${principalArn}`,
        description: f.actions?.length ? `Overprivileged actions: ${f.actions.slice(0, 10).join(", ")}` : null,
        resource: principalArn,
        fixedVersion: null,
        ruleName: f.PolicyName ?? f.type,
        dedupeKey: cloudsplainingDedupeKey(principalArn, f.type, f.PolicyName),
      });
    }
  }
  return findings;
}
