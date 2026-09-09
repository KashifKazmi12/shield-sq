import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";
import type { CompanyFeature } from "@prisma/client";

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

// Pure, dependency-free so it can be unit tested without mocking
// next-auth/Prisma (see src/lib/__tests__/rbac.test.ts).
export function hasFeature(features: CompanyFeature[], required: CompanyFeature) {
  return features.includes(required);
}

export async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "super_admin") {
    throw new ForbiddenError("Forbidden: super admin role required");
  }
  return session;
}

export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "admin" || !session.user.companyId || !session.user.id) {
    throw new ForbiddenError("Forbidden: admin role required");
  }
  return {
    companyId: session.user.companyId as string,
    userId: session.user.id as string,
    email: session.user.email as string,
  };
}

// Every mutation that targets a project re-checks that it actually belongs to
// the calling admin's own company — the admin role check alone isn't enough
// once a project id could belong to a different tenant.
export async function requireOwnedProject(projectId: string, companyId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId } });
  if (!project) throw new ForbiddenError("Forbidden: project does not belong to your company");
  return project;
}

// Gates a company-scoped route/action behind a product feature entitlement.
// Checked fresh on every call (not baked into the JWT) — same reasoning as
// the suspendedAt check in (dashboard)/layout.tsx: a super admin can change a
// company's entitlements at any time and that has to take effect immediately,
// not just on the user's next login.
export async function requireCompanyFeature(companyId: string, feature: CompanyFeature) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { features: true },
  });
  if (!company || !hasFeature(company.features, feature)) {
    throw new ForbiddenError(`Forbidden: your company does not have the "${feature}" feature enabled`);
  }
  return company.features;
}
