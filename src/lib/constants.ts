// One rolling Falco Scan per project per this many minutes — grouping Falco
// alerts into pipeline-run-shaped buckets since Falco has no pipeline concept.
export const FALCO_SCAN_BUCKET_MINUTES = Number(
  process.env.FALCO_SCAN_BUCKET_MINUTES ?? 60
);

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

// Shared page size for every cursor-paginated table (Vulnerabilities,
// Runtime Alerts, Pipeline Runs) — one constant so queries.ts and the
// Pagination component's range/page-count math never drift apart.
export const DEFAULT_PAGE_SIZE = 25;

export const INGEST_RATE_LIMIT_PER_MINUTE = 60;

// A large Trivy report (thousands of findings) is legitimate; an attempt to
// exhaust memory/DB time on a shared ingestion endpoint is not. 10MB covers
// realistic scans with headroom — this checks the declared Content-Length,
// not a hard streamed cap, so it's a first line of defense, not a guarantee.
export const MAX_INGEST_PAYLOAD_BYTES = 10 * 1024 * 1024;
