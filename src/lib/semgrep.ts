import { z } from "zod";
import type { Severity } from "./constants";
import type { BatchFindingInput } from "./batch-ingest";

// Semgrep's `--json` output shape (subset actually used here).
const semgrepResultSchema = z.object({
  check_id: z.string(),
  path: z.string(),
  start: z.object({ line: z.number() }),
  end: z.object({ line: z.number() }),
  extra: z.object({
    severity: z.string().optional(),
    message: z.string().optional(),
    lines: z.string().optional(),
  }),
});

const metaSchema = z.object({
  repo: z.string().optional(),
  branch: z.string().optional(),
  commitSha: z.string().optional(),
  pipelineId: z.string().optional(),
});

const rawSchema = z.object({
  results: z.array(semgrepResultSchema),
});

const wrapperSchema = z.object({
  meta: metaSchema,
  results: rawSchema,
});

export type ParsedSemgrepPayload = {
  meta: z.infer<typeof metaSchema>;
  report: z.infer<typeof rawSchema>;
};

export class SemgrepPayloadError extends Error {}

export function parseSemgrepPayload(body: unknown): ParsedSemgrepPayload {
  const asWrapper = wrapperSchema.safeParse(body);
  if (asWrapper.success) return { meta: asWrapper.data.meta, report: asWrapper.data.results };

  const asRaw = rawSchema.safeParse(body);
  if (asRaw.success) return { meta: {}, report: asRaw.data };

  throw new SemgrepPayloadError("Body must be Semgrep `--json` output or a { meta, results } wrapper");
}

// Semgrep severities: INFO | WARNING | ERROR.
function normalizeSemgrepSeverity(raw: string | undefined): Severity {
  switch ((raw ?? "").toUpperCase()) {
    case "ERROR":
      return "high";
    case "WARNING":
      return "medium";
    default:
      return "info";
  }
}

export function semgrepDedupeKey(checkId: string, path: string, startLine: number): string {
  return `semgrep:${checkId}:${path}:${startLine}`;
}

export function extractSemgrepFindings(report: ParsedSemgrepPayload["report"]): BatchFindingInput[] {
  return report.results.map((r) => ({
    severity: normalizeSemgrepSeverity(r.extra.severity),
    title: r.check_id,
    description: r.extra.message ?? null,
    resource: `${r.path}:${r.start.line}`,
    fixedVersion: null,
    ruleName: r.check_id,
    dedupeKey: semgrepDedupeKey(r.check_id, r.path, r.start.line),
  }));
}
