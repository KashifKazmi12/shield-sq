"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateTempPassword } from "@/lib/token";
import { requireSuperAdmin } from "@/lib/rbac";
import type { CompanyFeature } from "@prisma/client";

function validateFeatures(features: CompanyFeature[]) {
  if (!features.length) throw new Error("Select at least one feature");
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "company";
}

async function uniqueSlug(name: string) {
  const base = slugify(name);
  let slug = base;
  let suffix = 1;
  while (await prisma.company.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
  return slug;
}

export async function createCompany(input: {
  companyName: string;
  adminEmail: string;
  adminPassword: string;
  features: CompanyFeature[];
}) {
  await requireSuperAdmin();

  const companyName = input.companyName.trim();
  const adminEmail = input.adminEmail.trim().toLowerCase();
  if (!companyName) throw new Error("Company name is required");
  if (!adminEmail) throw new Error("Admin email is required");
  if (input.adminPassword.length < 8) throw new Error("Temporary password must be at least 8 characters");
  validateFeatures(input.features);

  const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existingUser) throw new Error("A user with that email already exists");

  const slug = await uniqueSlug(companyName);
  const passwordHash = await bcrypt.hash(input.adminPassword, 10);

  const company = await prisma.company.create({
    data: {
      name: companyName,
      slug,
      features: input.features,
      users: {
        create: { email: adminEmail, passwordHash, role: "admin" },
      },
    },
    include: { users: true },
  });

  // The admin just created becomes this company's owner — the one account
  // resetCompanyAdminPassword targets, even after more admins are added.
  await prisma.company.update({
    where: { id: company.id },
    data: { ownerId: company.users[0].id },
  });

  revalidatePath("/companies");
  return { companyId: company.id, companyName: company.name, adminEmail };
}

export async function updateCompanyFeatures(companyId: string, features: CompanyFeature[]) {
  await requireSuperAdmin();
  validateFeatures(features);
  await prisma.company.update({ where: { id: companyId }, data: { features } });
  revalidatePath("/companies");
}

export async function suspendCompany(companyId: string) {
  await requireSuperAdmin();
  await prisma.company.update({ where: { id: companyId }, data: { suspendedAt: new Date() } });
  revalidatePath("/companies");
}

export async function reactivateCompany(companyId: string) {
  await requireSuperAdmin();
  await prisma.company.update({ where: { id: companyId }, data: { suspendedAt: null } });
  revalidatePath("/companies");
}

// Covers the "forgotten password" ops case without a full email-based
// self-service reset flow (see DECISIONS.md): the super admin resets a
// company's admin password here, on demand, and hands the new one over
// out of band. A company can have several admins (settings/actions.ts's team
// management), so this targets the designated owner specifically, not
// whichever admin happens to be found first.
export async function resetCompanyAdminPassword(companyId: string) {
  await requireSuperAdmin();

  const company = await prisma.company.findUnique({ where: { id: companyId }, include: { owner: true } });
  const owner = company?.owner;
  if (!owner) throw new Error("This company has no owner to reset — set one first");

  const newPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: owner.id }, data: { passwordHash } });

  revalidatePath("/companies");
  return { adminEmail: owner.email, newPassword };
}

// Lets the super admin repoint "company owner" at a different existing admin
// (e.g. the original owner left) — must be an admin already in this company,
// not an arbitrary user.
export async function setCompanyOwner(companyId: string, userId: string) {
  await requireSuperAdmin();

  const user = await prisma.user.findFirst({ where: { id: userId, companyId, role: "admin" } });
  if (!user) throw new Error("User must be an admin in this company");

  await prisma.company.update({ where: { id: companyId }, data: { ownerId: userId } });
  revalidatePath("/companies");
}
