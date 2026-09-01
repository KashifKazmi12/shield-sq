import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TopHeader, Sidebar } from "./nav";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role = session.user?.role;
  let companyName: string | null = null;

  if (role === "admin" && session.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { onboardedAt: true },
    });
    if (user && !user.onboardedAt) redirect("/onboarding");
  }

  if (session.user?.companyId) {
    const company = await prisma.company.findUnique({
      where: { id: session.user.companyId },
      select: { name: true, suspendedAt: true },
    });
    // A suspension made after this JWT was issued can't be reflected in the
    // token itself — checked fresh here on every dashboard page load so a
    // suspended company's users are locked out within one request, not just
    // blocked from their *next* login.
    if (company?.suspendedAt) redirect("/login?suspended=1");
    companyName = company?.name ?? null;
  }

  return (
    <div className="app-shell">
      <TopHeader email={session.user?.email} />
      <div className="app-body">
        <Sidebar role={role} companyName={companyName} />
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
