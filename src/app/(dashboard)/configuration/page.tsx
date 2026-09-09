import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureProviderConfigRows, getProviderUsage } from "./actions";
import { ConfigurationManager } from "./ConfigurationManager";

export default async function ConfigurationPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user?.role !== "super_admin") redirect("/vulnerabilities");

  await ensureProviderConfigRows();

  const [providers, limits, usage] = await Promise.all([
    prisma.leakProviderConfig.findMany({ orderBy: { priority: "asc" } }),
    prisma.leakProviderLimits.findUniqueOrThrow({ where: { id: "default" } }),
    getProviderUsage(1),
  ]);

  return (
    <div>
      <h2 className="page-title">Configuration</h2>
      <ConfigurationManager providers={providers} limits={limits} initialUsage={usage} />
    </div>
  );
}
