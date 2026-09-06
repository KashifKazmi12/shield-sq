import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

// Company-scoped pages (Vulnerabilities, Runtime Alerts, Pipeline
// Runs, Trends, Settings, onboarding) all need the same guard: a signed-in
// user who actually belongs to a company. super_admin has no companyId and
// is redirected to /companies — middleware does this too, but a page-level
// fallback keeps these pages safe even if reached some other way.
export async function requireCompanySession() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user?.role === "super_admin" || !session.user?.companyId) {
    redirect("/companies");
  }
  return { session, companyId: session.user.companyId as string };
}
