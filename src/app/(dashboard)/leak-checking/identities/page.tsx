import { requireCompanySession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { LeakCheckingManager } from "../LeakCheckingManager";

export default async function LeakCheckingIdentitiesPage() {
  const { companyId } = await requireCompanySession();

  const identities = await prisma.monitoredIdentity.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { findings: true } } },
  });

  return (
    <div>
      <h2 className="page-title">Leak Checking — Identities</h2>
      <LeakCheckingManager identities={identities} />
    </div>
  );
}
