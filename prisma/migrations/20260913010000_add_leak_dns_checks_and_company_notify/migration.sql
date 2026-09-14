-- AlterTable
ALTER TABLE "LeakFinding" ADD COLUMN     "passwordPwned" BOOLEAN,
ADD COLUMN     "passwordPwnedCount" INTEGER;

-- CreateTable
CREATE TABLE "IdentityFinding" (
    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'opened',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeKey" TEXT NOT NULL,

    CONSTRAINT "IdentityFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyNotificationConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "slackWebhookUrl" TEXT,
    "notifyEmail" TEXT,
    "severityThreshold" TEXT NOT NULL DEFAULT 'high',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyNotificationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdentityFinding_identityId_type_status_idx" ON "IdentityFinding"("identityId", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityFinding_identityId_dedupeKey_key" ON "IdentityFinding"("identityId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyNotificationConfig_companyId_key" ON "CompanyNotificationConfig"("companyId");

-- AddForeignKey
ALTER TABLE "IdentityFinding" ADD CONSTRAINT "IdentityFinding_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "MonitoredIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyNotificationConfig" ADD CONSTRAINT "CompanyNotificationConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
