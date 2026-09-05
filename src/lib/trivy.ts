import { createHash } from "crypto";
import { z } from "zod";
import { normalizeTrivySeverity } from "./severity";

const trivyVulnerabilitySchema = z.object({
  VulnerabilityID: z.string(),
  PkgName: z.string().optional(),
  InstalledVersion: z.string().optional(),
  FixedVersion: z.string().optional(),
  Severity: z.string().optional(),
  Title: z.string().optional(),
  Description: z.string().optional(),
});

const trivyResultSchema = z.object({
  Target: z.string().optional(),
  // Trivy emits `null` (not an absent key) for a target class it scanned but
  // found nothing in — e.g. a clean requirements.txt alongside a vulnerable
  // package-lock.json in the same report. Rejecting that shape would bounce
  // an entire real scan just because one of its targets was clean.
  Vulnerabilities: z.array(trivyVulnerabilitySchema).nullable().optional(),
});

const trivyReportSchema = z.object({
  ArtifactName: z.string().optional(),
  Results: z.array(trivyResultSchema),
});

const metaSchema = z.object({
  repo: z.string().optional(),
  branch: z.string().optional(),
  commitSha: z.string().optional(),
  pipelineId: z.string().optional(),
});

const wrapperSchema = z.object({
  meta: metaSchema,
  results: trivyReportSchema,
});

export type ParsedTrivyPayload = {
  meta: z.infer<typeof metaSchema>;
  report: z.infer<typeof trivyReportSchema>;
};

export class TrivyPayloadError extends Error {}

// Accepts either raw `trivy image -f json` output, or a
// { meta: {...}, results: <trivy json> } wrapper carrying repo/branch/commit
// info Trivy itself doesn't emit. Whichever shape avoids the client needing to
// post-process Trivy's own output.
export function parseTrivyPayload(body: unknown): ParsedTrivyPayload {
  const asWrapper = wrapperSchema.safeParse(body);
  if (asWrapper.success) {
    return { meta: asWrapper.data.meta, report: asWrapper.data.results };
  }

  const asRaw = trivyReportSchema.safeParse(body);
  if (asRaw.success) {
    return { meta: {}, report: asRaw.data };
  }

  throw new TrivyPayloadError(
    "Body must be Trivy JSON output or { meta, results } wrapper"
  );
}

export function trivyIdempotencyKey(projectId: string, parsed: ParsedTrivyPayload): string {
  const { meta, report } = parsed;
  if (meta.repo && meta.commitSha) {
    return `trivy:${projectId}:${meta.repo}:${meta.commitSha}:${meta.pipelineId ?? ""}`;
  }
  // No repo/commit metadata supplied — fall back to content hash so identical
  // re-posts still dedupe, at the cost of not deduping a genuine re-scan.
  const contentHash = createHash("sha256")
    .update(JSON.stringify(report))
    .digest("hex");
  return `trivy:${projectId}:content:${contentHash}`;
}

export type TrivyFindingInput = {
  tool: "trivy";
  severity: string;
  title: string;
  description: string | null;
  resource: string | null;
  fixedVersion: string | null;
  ruleName: null;
  // Stable per (CVE, package, target) so re-scans of the same project don't
  // insert duplicate Finding rows — only genuinely new vulns are created.
  dedupeKey: string;
};

export function trivyFindingDedupeKey(
  vulnerabilityId: string,
  pkgName: string | undefined,
  target: string | undefined
): string {
  return `trivy:${vulnerabilityId}:${pkgName ?? ""}:${target ?? ""}`;
}

export function extractTrivyFindings(report: ParsedTrivyPayload["report"]): TrivyFindingInput[] {
  const findings: TrivyFindingInput[] = [];
  for (const result of report.Results ?? []) {
    for (const vuln of result.Vulnerabilities ?? []) {
      findings.push({
        tool: "trivy",
        severity: normalizeTrivySeverity(vuln.Severity),
        title: `${vuln.VulnerabilityID}${vuln.PkgName ? ` in ${vuln.PkgName}` : ""}`,
        description: vuln.Description ?? vuln.Title ?? null,
        resource: result.Target ?? null,
        fixedVersion: vuln.FixedVersion ?? null,
        ruleName: null,
        dedupeKey: trivyFindingDedupeKey(vuln.VulnerabilityID, vuln.PkgName, result.Target),
      });
    }
  }
  return findings;
}
