-- Finding lifecycle: status + openIntervals for accurate Lifetime tracking.
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'opened';
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "openIntervals" JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS "Finding_projectId_tool_status_idx" ON "Finding"("projectId", "tool", "status");

-- Backfill: treat existing findings as opened since detectedAt (still open).
UPDATE "Finding"
SET "openIntervals" = jsonb_build_array(
  jsonb_build_object(
    'start', to_char("detectedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'end', null
  )
)
WHERE "openIntervals" = '[]'::jsonb;
