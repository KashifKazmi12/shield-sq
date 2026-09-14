import { createHash } from "crypto";
import { z } from "zod";
import type { BatchFindingInput } from "./batch-ingest";

// gitleaks `--report-format json` output: a flat array of leak entries.
// A trufflehog deployment should translate its own JSON lines into this same
// shape before posting here (RuleID/File/StartLine/Match/Secret/Description)
// rather than getting a second parser/route — the two tools' outputs are
// close enough that translating client-side avoids maintaining two schemas
// for one "secrets history" feature.
const gitleaksEntrySchema = z.object({
  RuleID: z.string(),
  File: z.string(),
  StartLine: z.number(),
  Match: z.string().optional(),
  Secret: z.string().optional(),
  Description: z.string().optional(),
  Commit: z.string().optional(),
});

const metaSchema = z.object({
  repo: z.string().optional(),
  branch: z.string().optional(),
  commitSha: z.string().optional(),
  pipelineId: z.string().optional(),
});

const rawSchema = z.array(gitleaksEntrySchema);
const wrapperSchema = z.object({ meta: metaSchema, results: rawSchema });

export type ParsedGitleaksPayload = {
  meta: z.infer<typeof metaSchema>;
  report: z.infer<typeof rawSchema>;
};

export class GitleaksPayloadError extends Error {}

export function parseGitleaksPayload(body: unknown): ParsedGitleaksPayload {
  const asWrapper = wrapperSchema.safeParse(body);
  if (asWrapper.success) return { meta: asWrapper.data.meta, report: asWrapper.data.results };

  const asRaw = rawSchema.safeParse(body);
  if (asRaw.success) return { meta: {}, report: asRaw.data };

  throw new GitleaksPayloadError("Body must be gitleaks JSON report output (array) or a { meta, results } wrapper");
}

// A secret's exact value is never used as (part of) the dedupe key or stored
// in title/description/resource — only a one-way hash of it, so a leaked
// credential doesn't get duplicated into Finding rows in plaintext.
function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 16);
}

export function gitleaksDedupeKey(ruleId: string, file: string, startLine: number, secretHash: string): string {
  return `gitleaks:${ruleId}:${file}:${startLine}:${secretHash}`;
}

export function extractGitleaksFindings(report: ParsedGitleaksPayload["report"]): BatchFindingInput[] {
  return report.map((e) => {
    const secretHash = hashSecret(e.Secret ?? e.Match ?? `${e.RuleID}:${e.File}:${e.StartLine}`);
    return {
      // A committed secret is treated as high severity by default — history
      // scanners have no reliable signal (like Semgrep's rule tiers) to
      // distinguish a critical cloud key from a low-value one.
      severity: "high",
      title: `Secret detected: ${e.RuleID}`,
      description: e.Description ?? null,
      resource: `${e.File}:${e.StartLine}${e.Commit ? ` (${e.Commit.slice(0, 8)})` : ""}`,
      fixedVersion: null,
      ruleName: e.RuleID,
      dedupeKey: gitleaksDedupeKey(e.RuleID, e.File, e.StartLine, secretHash),
    };
  });
}
