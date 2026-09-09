import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";
import { hasFeature } from "./rbac";
import type { CompanyFeature } from "@prisma/client";

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

const FEATURE_HOME: Record<CompanyFeature, string> = {
  vulnerabilities: "/vulnerabilities",
  runtime_alerts: "/runtime-alerts",
  leak_checking: "/leak-checking",
  url_monitoring: "/url-monitoring",
};

// Feature entitlement is looked up fresh on every load, not cached in the
// JWT — same reasoning as the suspendedAt check in (dashboard)/layout.tsx: a
// super admin can change a company's entitlements at any time and that has
// to take effect immediately, not just on the user's next login.
export async function requireCompanyFeatureSession(required: CompanyFeature) {
  const { session, companyId } = await requireCompanySession();

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { features: true },
  });
  const features = company?.features ?? [];

  if (!hasFeature(features, required)) {
    const fallback = (Object.keys(FEATURE_HOME) as CompanyFeature[]).find(
      (f) => f !== required && hasFeature(features, f)
    );
    redirect(fallback ? FEATURE_HOME[fallback] : "/settings");
  }

  return { session, companyId, features };
}
