-- Immutable per-run observations: a finding can appear on many scans.
CREATE TABLE "ScanFinding" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanFinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScanFinding_scanId_findingId_key" ON "ScanFinding"("scanId", "findingId");
CREATE INDEX "ScanFinding_findingId_idx" ON "ScanFinding"("findingId");
CREATE INDEX "ScanFinding_scanId_idx" ON "ScanFinding"("scanId");

ALTER TABLE "ScanFinding" ADD CONSTRAINT "ScanFinding_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScanFinding" ADD CONSTRAINT "ScanFinding_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing finding counts as observed on its (first) scan.
INSERT INTO "ScanFinding" ("id", "scanId", "findingId", "observedAt")
SELECT
  'sf_' || f."id",
  f."scanId",
  f."id",
  f."detectedAt"
FROM "Finding" f
ON CONFLICT DO NOTHING;
