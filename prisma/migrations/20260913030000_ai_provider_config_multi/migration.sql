-- AlterTable
-- Move from "one active provider per company" to "one row per (company,
-- provider), exactly one marked isActive" so a company can configure all
-- 4 providers at once and switch between them without re-entering keys.
ALTER TABLE "AiProviderConfig" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT false;

-- Preserve any already-configured provider as active, rather than silently
-- deactivating a working setup.
UPDATE "AiProviderConfig" SET "isActive" = true WHERE "model" IS NOT NULL;

-- DropIndex
DROP INDEX "AiProviderConfig_companyId_key";

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderConfig_companyId_provider_key" ON "AiProviderConfig"("companyId", "provider");

-- CreateIndex
CREATE INDEX "AiProviderConfig_companyId_isActive_idx" ON "AiProviderConfig"("companyId", "isActive");
