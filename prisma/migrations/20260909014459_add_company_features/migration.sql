-- CreateEnum
CREATE TYPE "CompanyFeature" AS ENUM ('vulnerabilities', 'runtime_alerts');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "features" "CompanyFeature"[] NOT NULL DEFAULT ARRAY[]::"CompanyFeature"[];

-- Backfill: before this migration every company implicitly had access to
-- every feature (there was no gating), so give existing rows both features
-- explicitly instead of silently taking access away.
UPDATE "Company" SET "features" = ARRAY['vulnerabilities','runtime_alerts']::"CompanyFeature"[];
