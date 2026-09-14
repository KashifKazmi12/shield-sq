import { z } from "zod";
import type { BatchFindingInput } from "./batch-ingest";

// Accepts either `trivy config -f json` output (Results[].Misconfigurations[])
// or Checkov's `--output json` shape (results.failed_checks[]) — both cover
// the same "IaC Misconfig Scanner" feature per FUTURE-FEATURES.md, and a
// customer picks whichever tool their pipeline already uses.
const trivyMisconfigSchema = z.object({
  ID: z.string(),
  Title: z.string().optional(),
  Description: z.string().optional(),
  Severity: z.string().optional(),
  Resolution: z.string().optional(),
});

const trivyResultSchema = z.object({
  Target: z.string().optional(),
  Misconfigurations: z.array(trivyMisconfigSchema).nullable().optional(),
});

const trivyRawSchema = z.object({ Results: z.array(trivyResultSchema) });

const checkovCheckSchema = z.object({
  check_id: z.string(),
  check_name: z.string().optional(),
  file_path: z.string().optional(),
  file_line_range: z.array(z.number()).optional(),
  guideline: z.string().optional(),
});

const checkovRawSchema = z.object({
  results: z.object({ failed_checks: z.array(checkovCheckSchema) }),
});

const metaSchema = z.object({
  repo: z.string().optional(),
  branch: z.string().optional(),
  commitSha: z.string().optional(),
  pipelineId: z.string().optional(),
});

type TrivyRaw = z.infer<typeof trivyRawSchema>;
type CheckovRaw = z.infer<typeof checkovRawSchema>;

export type ParsedIacMisconfigPayload = {
  meta: z.infer<typeof metaSchema>;
  report: { kind: "trivy"; data: TrivyRaw } | { kind: "checkov"; data: CheckovRaw };
};

export class IacMisconfigPayloadError extends Error {}

export function parseIacMisconfigPayload(body: unknown): ParsedIacMisconfigPayload {
  // Only treat the body as a { meta, results } wrapper when a `meta` key is
  // actually present — Checkov's own raw output shape happens to have a
  // top-level `results` key too (`{ results: { failed_checks: [...] } }`),
  // which would otherwise get misread as "unwrap one level" and fail to match
  // either schema.
  const bodyObj = body as { meta?: unknown; results?: unknown };
  const isWrapper = typeof body === "object" && body !== null && "meta" in bodyObj && "results" in bodyObj;
  const wrapperMeta = isWrapper ? metaSchema.safeParse(bodyObj.meta) : null;
  const meta = wrapperMeta?.success ? wrapperMeta.data : {};
  const inner = isWrapper ? bodyObj.results : body;

  const asTrivy = trivyRawSchema.safeParse(inner);
  if (asTrivy.success) return { meta, report: { kind: "trivy", data: asTrivy.data } };

  const asCheckov = checkovRawSchema.safeParse(inner);
  if (asCheckov.success) return { meta, report: { kind: "checkov", data: asCheckov.data } };

  throw new IacMisconfigPayloadError(
    "Body must be `trivy config -f json` output or Checkov `--output json` output, optionally wrapped in { meta, results }"
  );
}

function normalizeTrivySeverity(raw: string | undefined): string {
  switch ((raw ?? "").toUpperCase()) {
    case "CRITICAL":
      return "critical";
    case "HIGH":
      return "high";
    case "MEDIUM":
      return "medium";
    case "LOW":
      return "low";
    default:
      return "info";
  }
}

export function iacMisconfigDedupeKey(checkId: string, resource: string | undefined): string {
  return `iac-misconfig:${checkId}:${resource ?? ""}`;
}

export function extractIacMisconfigFindings(report: ParsedIacMisconfigPayload["report"]): BatchFindingInput[] {
  if (report.kind === "trivy") {
    const findings: BatchFindingInput[] = [];
    for (const result of report.data.Results ?? []) {
      for (const m of result.Misconfigurations ?? []) {
        findings.push({
          severity: normalizeTrivySeverity(m.Severity),
          title: m.Title ?? m.ID,
          description: m.Description ?? m.Resolution ?? null,
          resource: result.Target ?? null,
          fixedVersion: null,
          ruleName: m.ID,
          dedupeKey: iacMisconfigDedupeKey(m.ID, result.Target),
        });
      }
    }
    return findings;
  }

  return report.data.results.failed_checks.map((c) => ({
    // Checkov's JSON doesn't carry a severity field on the open-source
    // policy set — every failed check surfaces as medium until a customer's
    // own policy tier says otherwise, rather than guessing.
    severity: "medium",
    title: c.check_name ?? c.check_id,
    description: c.guideline ?? null,
    resource: c.file_path
      ? `${c.file_path}${c.file_line_range ? `:${c.file_line_range[0]}` : ""}`
      : null,
    fixedVersion: null,
    ruleName: c.check_id,
    dedupeKey: iacMisconfigDedupeKey(c.check_id, c.file_path),
  }));
}
