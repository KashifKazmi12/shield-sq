import { requireCompanySession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { UrlMonitoringManager } from "../UrlMonitoringManager";

export default async function UrlMonitoringSitesPage() {
  const { companyId } = await requireCompanySession();

  const sites = await prisma.monitoredSite.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { endpoints: true } },
      scans: { orderBy: { scannedAt: "desc" }, take: 1, where: { endpointId: null } },
    },
  });

  return (
    <div>
      <h2 className="page-title">URL Monitoring — Sites</h2>
      <UrlMonitoringManager sites={sites} />
    </div>
  );
}
