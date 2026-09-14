-- AlterTable
ALTER TABLE "Finding" ADD COLUMN     "rawContext" JSONB,
ADD COLUMN     "aiPriorityScore" INTEGER,
ADD COLUMN     "aiPriorityReason" TEXT;

-- CreateTable
CREATE TABLE "AiInsight" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "findingId" TEXT,
    "provider" "AiProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiInsight_companyId_findingId_idx" ON "AiInsight"("companyId", "findingId");

-- AddForeignKey
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
