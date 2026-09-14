-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('anthropic', 'openai', 'xai', 'google');

-- AlterEnum
ALTER TYPE "CompanyFeature" ADD VALUE 'ai_assistant';

-- AlterTable
-- Prisma's migration generator drops the column default as a side effect of
-- adding a new enum value in the same migration — restored below, same
-- reasoning as the leak_checking/url_monitoring migration.
ALTER TABLE "Company" ALTER COLUMN "features" DROP DEFAULT;

-- CreateTable
CREATE TABLE "AiProviderConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "apiKeyCiphertext" TEXT,
    "apiKeyPreview" TEXT,
    "model" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "success" BOOLEAN NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderConfig_companyId_key" ON "AiProviderConfig"("companyId");

-- CreateIndex
CREATE INDEX "AiUsageLog_companyId_createdAt_idx" ON "AiUsageLog"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiProviderConfig" ADD CONSTRAINT "AiProviderConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restore the default enum ALTER TYPE dropped above.
ALTER TABLE "Company" ALTER COLUMN "features" SET DEFAULT ARRAY[]::"CompanyFeature"[];
