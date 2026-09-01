"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateTempPassword } from "@/lib/token";

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "super_admin") {
    throw new Error("Forbidden: super admin role required");
  }
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
}) {
  await requireSuperAdmin();

  const companyName = input.companyName.trim();
  const adminEmail = input.adminEmail.trim().toLowerCase();
  if (!companyName) throw new Error("Company name is required");
  if (!adminEmail) throw new Error("Admin email is required");
  if (input.adminPassword.length < 8) throw new Error("Temporary password must be at least 8 characters");

  const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existingUser) throw new Error("A user with that email already exists");

  const slug = await uniqueSlug(companyName);
  const passwordHash = await bcrypt.hash(input.adminPassword, 10);

  const company = await prisma.company.create({
    data: {
      name: companyName,
      slug,
      users: {
        create: { email: adminEmail, passwordHash, role: "admin" },
      },
    },
  });

  revalidatePath("/companies");
  return { companyId: company.id, companyName: company.name, adminEmail };
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
// out of band. Targets the first admin user found for the company — a
// company can now have several (see settings/actions.ts's team management),
// so this resets *an* admin, not necessarily a specific one; fine for the
// common one-admin-per-company case, worth revisiting once that's not rare.
export async function resetCompanyAdminPassword(companyId: string) {
  await requireSuperAdmin();

  const admin = await prisma.user.findFirst({ where: { companyId, role: "admin" } });
  if (!admin) throw new Error("This company has no admin user to reset");

  const newPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: admin.id }, data: { passwordHash } });

  revalidatePath("/companies");
  return { adminEmail: admin.email, newPassword };
}
