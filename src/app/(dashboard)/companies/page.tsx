import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CompanyManager } from "./CompanyManager";

export default async function CompaniesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user?.role !== "super_admin") redirect("/overview");

  const companies = await prisma.company.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { users: true, projects: true } } },
  });

  return (
    <div>
      <h2 className="page-title">Companies</h2>
      <CompanyManager companies={companies} />
    </div>
  );
}
