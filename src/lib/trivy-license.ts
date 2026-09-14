import { z } from "zod";
import type { BatchFindingInput } from "./batch-ingest";

// `trivy fs --scanners license -f json` (or `trivy image --scanners license`)
// output — same Results[] envelope as vulnerability scanning, but each
// result carries a Licenses[] array instead of Vulnerabilities[].
const licenseSchema = z.object({
  PkgName: z.string().optional(),
  Name: z.string(), // SPDX license identifier, e.g. "GPL-3.0", "AGPL-3.0"
  // Trivy's own license risk classification.
  Category: z.string().optional(), // "forbidden" | "restricted" | "reciprocal" | "notice" | "permissive" | "unencumbered" | "unknown"
  FilePath: z.string().optional(),
});

const resultSchema = z.object({
  Target: z.string().optional(),
  Licenses: z.array(licenseSchema).nullable().optional(),
});

const rawSchema = z.object({
  ArtifactName: z.string().optional(),
  Results: z.array(resultSchema),
});

const metaSchema = z.object({
  repo: z.string().optional(),
  branch: z.string().optional(),
  commitSha: z.string().optional(),
  pipelineId: z.string().optional(),
});

const wrapperSchema = z.object({ meta: metaSchema, results: rawSchema });

export type ParsedTrivyLicensePayload = {
  meta: z.infer<typeof metaSchema>;
  report: z.infer<typeof rawSchema>;
};

export class TrivyLicensePayloadError extends Error {}

export function parseTrivyLicensePayload(body: unknown): ParsedTrivyLicensePayload {
  const asWrapper = wrapperSchema.safeParse(body);
  if (asWrapper.success) return { meta: asWrapper.data.meta, report: asWrapper.data.results };

  const asRaw = rawSchema.safeParse(body);
  if (asRaw.success) return { meta: {}, report: asRaw.data };

  throw new TrivyLicensePayloadError("Body must be `trivy ... --scanners license -f json` output or a { meta, results } wrapper");
}

// Only Trivy's own "forbidden"/"restricted" tiers are worth surfacing as a
// finding by default — "permissive"/"notice"/"unencumbered" licenses are
// compliant and would otherwise flood the findings list with noise.
const FLAGGED_CATEGORIES = new Set(["forbidden", "restricted", "reciprocal", "unknown"]);

function severityForCategory(category: string | undefined): string {
  switch (category) {
    case "forbidden":
      return "high";
    case "restricted":
    case "reciprocal":
      return "medium";
    default:
      return "low";
  }
}

export function trivyLicenseDedupeKey(licenseName: string, pkgName: string | undefined, target: string | undefined): string {
  return `trivy-license:${licenseName}:${pkgName ?? ""}:${target ?? ""}`;
}

export function extractTrivyLicenseFindings(report: ParsedTrivyLicensePayload["report"]): BatchFindingInput[] {
  const findings: BatchFindingInput[] = [];
  for (const result of report.Results ?? []) {
    for (const lic of result.Licenses ?? []) {
      if (!FLAGGED_CATEGORIES.has(lic.Category ?? "unknown")) continue;
      findings.push({
        severity: severityForCategory(lic.Category),
        title: `${lic.Name}${lic.PkgName ? ` in ${lic.PkgName}` : ""}`,
        description: `License category: ${lic.Category ?? "unknown"}`,
        resource: result.Target ?? lic.FilePath ?? null,
        fixedVersion: null,
        ruleName: lic.Category ?? null,
        dedupeKey: trivyLicenseDedupeKey(lic.Name, lic.PkgName, result.Target),
      });
    }
  }
  return findings;
}
