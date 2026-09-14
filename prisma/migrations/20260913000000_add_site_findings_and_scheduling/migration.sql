-- AlterTable
-- Scheduling fields for the cron-driven URL-monitoring rescan sweep, mirroring
-- MonitoredIdentity's checkIntervalMins/lastCheckedAt/nextCheckAt columns.
ALTER TABLE "MonitoredSite" ADD COLUMN     "checkIntervalMins" INTEGER NOT NULL DEFAULT 1440,
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "nextCheckAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SiteFinding" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'opened',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeKey" TEXT NOT NULL,

    CONSTRAINT "SiteFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonitoredSite_nextCheckAt_idx" ON "MonitoredSite"("nextCheckAt");

-- CreateIndex
CREATE INDEX "SiteFinding_siteId_type_status_idx" ON "SiteFinding"("siteId", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SiteFinding_siteId_dedupeKey_key" ON "SiteFinding"("siteId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "SiteFinding" ADD CONSTRAINT "SiteFinding_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "MonitoredSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
