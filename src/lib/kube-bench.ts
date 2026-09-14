import { z } from "zod";
import type { BatchFindingInput } from "./batch-ingest";

// kube-bench `--json` output: Controls[].tests[].results[] (kube-hunter
// results can be translated into the same test/result shape client-side —
// see the note in gitleaks.ts for the same reasoning applied to trufflehog).
const testResultSchema = z.object({
  test_number: z.string().optional(),
  test_desc: z.string(),
  status: z.string(), // "PASS" | "FAIL" | "WARN" | "INFO"
  remediation: z.string().optional(),
});

const testSchema = z.object({
  section: z.string().optional(),
  results: z.array(testResultSchema),
});

const controlSchema = z.object({
  id: z.string().optional(),
  text: z.string().optional(),
  tests: z.array(testSchema),
});

const rawSchema = z.object({ Controls: z.array(controlSchema) });

const metaSchema = z.object({
  repo: z.string().optional(),
  branch: z.string().optional(),
  commitSha: z.string().optional(),
  pipelineId: z.string().optional(),
  cluster: z.string().optional(),
});

const wrapperSchema = z.object({ meta: metaSchema, results: rawSchema });

export type ParsedKubeBenchPayload = {
  meta: z.infer<typeof metaSchema>;
  report: z.infer<typeof rawSchema>;
};

export class KubeBenchPayloadError extends Error {}

export function parseKubeBenchPayload(body: unknown): ParsedKubeBenchPayload {
  const asWrapper = wrapperSchema.safeParse(body);
  if (asWrapper.success) return { meta: asWrapper.data.meta, report: asWrapper.data.results };

  const asRaw = rawSchema.safeParse(body);
  if (asRaw.success) return { meta: {}, report: asRaw.data };

  throw new KubeBenchPayloadError("Body must be kube-bench `--json` output or a { meta, results } wrapper");
}

function severityForStatus(status: string): string {
  switch (status.toUpperCase()) {
    case "FAIL":
      return "high";
    case "WARN":
      return "medium";
    default:
      return "info";
  }
}

export function kubeBenchDedupeKey(testNumber: string | undefined, testDesc: string, cluster: string | undefined): string {
  return `kube-bench:${cluster ?? ""}:${testNumber ?? testDesc}`;
}

export function extractKubeBenchFindings(report: ParsedKubeBenchPayload["report"], cluster: string | undefined): BatchFindingInput[] {
  const findings: BatchFindingInput[] = [];
  for (const control of report.Controls ?? []) {
    for (const test of control.tests ?? []) {
      for (const r of test.results ?? []) {
        if (r.status.toUpperCase() === "PASS") continue; // only surface failures/warnings as findings
        findings.push({
          severity: severityForStatus(r.status),
          title: r.test_desc,
          description: r.remediation ?? null,
          resource: cluster ?? control.text ?? null,
          fixedVersion: null,
          ruleName: r.test_number ?? null,
          dedupeKey: kubeBenchDedupeKey(r.test_number, r.test_desc, cluster),
        });
      }
    }
  }
  return findings;
}
