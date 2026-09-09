-- AlterTable
ALTER TABLE "LeakProviderConfig" ADD COLUMN     "usageCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "LeakProviderConfig_priority_idx" ON "LeakProviderConfig"("priority");
