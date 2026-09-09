-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "ownerId" TEXT;

-- Backfill: pick each company's earliest-created admin as its owner, so
-- existing companies (which may already have several admins) get a sensible
-- default instead of a NULL owner.
UPDATE "Company" c
SET "ownerId" = sub.id
FROM (
  SELECT DISTINCT ON (u."companyId") u.id, u."companyId"
  FROM "User" u
  WHERE u.role = 'admin' AND u."companyId" IS NOT NULL
  ORDER BY u."companyId", u."createdAt" ASC
) sub
WHERE c.id = sub."companyId";

-- CreateIndex
CREATE UNIQUE INDEX "Company_ownerId_key" ON "Company"("ownerId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
