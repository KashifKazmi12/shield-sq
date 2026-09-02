import type { ReactNode } from "react";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listProjects } from "@/lib/queries";
import { DashboardShell } from "./nav";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role = session.user?.role;
  let companyName: string | null = null;
  let projects: { id: string; name: string }[] = [];
  let defaultProjectId: string | undefined;

  if (role === "admin" && session.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { onboardedAt: true },
    });
    if (user && !user.onboardedAt) redirect("/onboarding");
  }

  if (session.user?.companyId) {
    const companyId = session.user.companyId;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, suspendedAt: true },
    });
    // A suspension made after this JWT was issued can't be reflected in the
    // token itself — checked fresh here on every dashboard page load so a
    // suspended company's users are locked out within one request, not just
    // blocked from their *next* login.
    if (company?.suspendedAt) redirect("/login?suspended=1");
    companyName = company?.name ?? null;

    const [projectList, defaultProject] = await Promise.all([
      listProjects(companyId),
      prisma.project.findFirst({
        where: { companyId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      }),
    ]);
    projects = projectList.map((p) => ({ id: p.id, name: p.name }));
    defaultProjectId = defaultProject?.id;
  }

  return (
    <div className="app-shell">
      {/* useSearchParams in the header/sidebar needs a Suspense boundary. */}
      <Suspense
        fallback={
          <>
            <header className="top-header">
              <div />
            </header>
            <div className="app-body">
              <nav className="sidebar">
                <div className="section-label">{companyName ?? "Dashboards"}</div>
              </nav>
              <main className="main">{children}</main>
            </div>
          </>
        }
      >
        <DashboardShell
          email={session.user?.email}
          projects={projects}
          defaultProjectId={defaultProjectId}
          role={role}
          companyName={companyName}
        >
          {children}
        </DashboardShell>
      </Suspense>
    </div>
  );
}
