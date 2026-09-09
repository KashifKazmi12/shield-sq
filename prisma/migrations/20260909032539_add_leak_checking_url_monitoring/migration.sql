-- CreateEnum
CREATE TYPE "LeakIdentifierType" AS ENUM ('email', 'username');

-- CreateEnum
CREATE TYPE "MonitorStatus" AS ENUM ('pending', 'active', 'disabled', 'error');

-- CreateEnum
CREATE TYPE "LeakProvider" AS ENUM ('checkleaked', 'leakcheck');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CompanyFeature" ADD VALUE 'leak_checking';
ALTER TYPE "CompanyFeature" ADD VALUE 'url_monitoring';

-- AlterTable
-- Prisma's migration generator drops the column default as a side effect of
-- adding new enum values in the same migration (Postgres requires the new
-- enum values to be committed before anything can reference them, including
-- a column default) — restored below so new Company rows keep getting `{}`
-- instead of failing NOT NULL if a caller ever omits `features`.
ALTER TABLE "Company" ALTER COLUMN "features" DROP DEFAULT;

-- CreateTable
CREATE TABLE "MonitoredIdentity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT,
    "identifierType" "LeakIdentifierType" NOT NULL,
    "identifierValue" TEXT NOT NULL,
    "status" "MonitorStatus" NOT NULL DEFAULT 'pending',
    "checkIntervalMins" INTEGER NOT NULL DEFAULT 1440,
    "lastCheckedAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoredIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeakFinding" (
    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "breachName" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "leakedAt" TIMESTAMP(3),
    "dedupeKey" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeakFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoredSite" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoredSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoredEndpoint" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoredEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteScanResult" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "endpointId" TEXT,
    "statusCode" INTEGER,
    "latencyMs" DOUBLE PRECISION,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteScanResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeakProviderConfig" (
    "id" TEXT NOT NULL,
    "provider" "LeakProvider" NOT NULL,
    "apiKeyCiphertext" TEXT,
    "apiKeyPreview" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "LeakProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeakProviderUsage" (
    "id" TEXT NOT NULL,
    "provider" "LeakProvider" NOT NULL,
    "companyId" TEXT,
    "userId" TEXT,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeakProviderUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeakProviderLimits" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "globalDailyLimit" INTEGER,
    "perCompanyDailyLimit" INTEGER,
    "perUserDailyLimit" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeakProviderLimits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonitoredIdentity_nextCheckAt_idx" ON "MonitoredIdentity"("nextCheckAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredIdentity_companyId_identifierType_identifierValue_key" ON "MonitoredIdentity"("companyId", "identifierType", "identifierValue");

-- CreateIndex
CREATE INDEX "LeakFinding_identityId_source_breachName_idx" ON "LeakFinding"("identityId", "source", "breachName");

-- CreateIndex
CREATE UNIQUE INDEX "LeakFinding_identityId_dedupeKey_key" ON "LeakFinding"("identityId", "dedupeKey");

-- CreateIndex
CREATE INDEX "MonitoredSite_companyId_domain_idx" ON "MonitoredSite"("companyId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredSite_companyId_url_key" ON "MonitoredSite"("companyId", "url");

-- CreateIndex
CREATE INDEX "MonitoredEndpoint_siteId_idx" ON "MonitoredEndpoint"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredEndpoint_siteId_url_key" ON "MonitoredEndpoint"("siteId", "url");

-- CreateIndex
CREATE INDEX "SiteScanResult_siteId_scannedAt_idx" ON "SiteScanResult"("siteId", "scannedAt");

-- CreateIndex
CREATE INDEX "SiteScanResult_endpointId_scannedAt_idx" ON "SiteScanResult"("endpointId", "scannedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeakProviderConfig_provider_key" ON "LeakProviderConfig"("provider");

-- CreateIndex
CREATE INDEX "LeakProviderUsage_provider_createdAt_idx" ON "LeakProviderUsage"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "LeakProviderUsage_companyId_createdAt_idx" ON "LeakProviderUsage"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "LeakProviderUsage_userId_createdAt_idx" ON "LeakProviderUsage"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "MonitoredIdentity" ADD CONSTRAINT "MonitoredIdentity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoredIdentity" ADD CONSTRAINT "MonitoredIdentity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeakFinding" ADD CONSTRAINT "LeakFinding_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "MonitoredIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoredSite" ADD CONSTRAINT "MonitoredSite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoredEndpoint" ADD CONSTRAINT "MonitoredEndpoint_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "MonitoredSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteScanResult" ADD CONSTRAINT "SiteScanResult_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "MonitoredSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteScanResult" ADD CONSTRAINT "SiteScanResult_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "MonitoredEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeakProviderConfig" ADD CONSTRAINT "LeakProviderConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeakProviderUsage" ADD CONSTRAINT "LeakProviderUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeakProviderUsage" ADD CONSTRAINT "LeakProviderUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Restore the default enum ALTER TYPE dropped above (new Company rows still
-- default to no features, same as before this migration).
ALTER TABLE "Company" ALTER COLUMN "features" SET DEFAULT ARRAY[]::"CompanyFeature"[];
