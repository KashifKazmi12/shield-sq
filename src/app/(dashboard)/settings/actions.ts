"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateIngestToken, hashToken, generateTempPassword } from "@/lib/token";
import { logAdminAction } from "@/lib/audit";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "admin" || !session.user.companyId || !session.user.id) {
    throw new Error("Forbidden: admin role required");
  }
  return {
    companyId: session.user.companyId as string,
    userId: session.user.id as string,
    email: session.user.email as string,
  };
}

// Every mutation below re-checks that the target project actually belongs
// to the calling admin's own company — the admin role check alone isn't
// enough once a project id could belong to a different tenant.
async function requireOwnedProject(projectId: string, companyId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId } });
  if (!project) throw new Error("Forbidden: project does not belong to your company");
  return project;
}

export async function createIngestToken(projectId: string, label: string) {
  const { companyId, email } = await requireAdmin();
  const project = await requireOwnedProject(projectId, companyId);

  const rawToken = generateIngestToken();
  await prisma.ingestToken.create({
    data: { projectId, tokenHash: hashToken(rawToken), label: label || null },
  });
  await logAdminAction({ companyId, actorEmail: email, action: "token.create", detail: `project=${project.name} label=${label || "(none)"}` });
  revalidatePath("/settings");
  return rawToken;
}

export async function revokeIngestToken(tokenId: string) {
  const { companyId, email } = await requireAdmin();
  const token = await prisma.ingestToken.findUnique({ where: { id: tokenId }, include: { project: true } });
  if (!token || token.project.companyId !== companyId) {
    throw new Error("Forbidden: token does not belong to your company");
  }
  await prisma.ingestToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  });
  await logAdminAction({ companyId, actorEmail: email, action: "token.revoke", detail: `project=${token.project.name} label=${token.label ?? "(none)"}` });
  revalidatePath("/settings");
}

export async function updateNotificationConfig(projectId: string, data: {
  slackWebhookUrl: string;
  notifyEmail: string;
  severityThreshold: string;
}) {
  const { companyId, email } = await requireAdmin();
  const project = await requireOwnedProject(projectId, companyId);

  await prisma.notificationConfig.upsert({
    where: { projectId },
    update: {
      slackWebhookUrl: data.slackWebhookUrl || null,
      notifyEmail: data.notifyEmail || null,
      severityThreshold: data.severityThreshold,
    },
    create: {
      projectId,
      slackWebhookUrl: data.slackWebhookUrl || null,
      notifyEmail: data.notifyEmail || null,
      severityThreshold: data.severityThreshold,
    },
  });
  await logAdminAction({ companyId, actorEmail: email, action: "notify.update", detail: `project=${project.name} threshold=${data.severityThreshold}` });
  revalidatePath("/settings");
}

export async function createProject(name: string) {
  const { companyId, email } = await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Project name is required");

  const project = await prisma.project.create({ data: { name: trimmed, companyId } });
  await logAdminAction({ companyId, actorEmail: email, action: "project.create", detail: `name=${trimmed}` });
  revalidatePath("/settings");
  return project.id;
}

// Self-service password change — any signed-in role (admin or viewer), for
// their own account only. This is the one password-management path that
// doesn't need the super admin: it closes the everyday "I want to change my
// password" case without a full email-based reset flow.
export async function changeOwnPassword(currentPassword: string, newPassword: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Not signed in");

  if (newPassword.length < 8) throw new Error("New password must be at least 8 characters");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) throw new Error("Not signed in");

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new Error("Current password is incorrect");

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
}

// Adding a teammate is admin-driven, not self-service — same pattern as the
// super admin creating a company's first admin: set a temp password here,
// shown once, hand it over out of band. New teammates are marked already
// onboarded (the company's project/tokens already exist, so the setup
// wizard would be redundant for them).
export async function createTeammate(email: string, role: "admin" | "viewer") {
  const { companyId, email: actorEmail } = await requireAdmin();

  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail) throw new Error("Email is required");
  if (role !== "admin" && role !== "viewer") throw new Error("Role must be admin or viewer");

  const existing = await prisma.user.findUnique({ where: { email: trimmedEmail } });
  if (existing) throw new Error("A user with that email already exists");

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  await prisma.user.create({
    data: { email: trimmedEmail, passwordHash, role, companyId, onboardedAt: new Date() },
  });

  await logAdminAction({ companyId, actorEmail, action: "team.add", detail: `email=${trimmedEmail} role=${role}` });
  revalidatePath("/settings");
  return { email: trimmedEmail, tempPassword };
}

export async function removeTeammate(userId: string) {
  const { companyId, userId: callerId, email: actorEmail } = await requireAdmin();
  if (userId === callerId) throw new Error("You can't remove your own account here");

  const target = await prisma.user.findFirst({ where: { id: userId, companyId } });
  if (!target) throw new Error("User does not belong to your company");

  if (target.role === "admin") {
    const otherAdmins = await prisma.user.count({ where: { companyId, role: "admin", id: { not: userId } } });
    if (otherAdmins === 0) throw new Error("Cannot remove the last admin in your company");
  }

  await prisma.user.delete({ where: { id: userId } });
  await logAdminAction({ companyId, actorEmail, action: "team.remove", detail: `email=${target.email} role=${target.role}` });
  revalidatePath("/settings");
}

export async function resetTeammatePassword(userId: string) {
  const { companyId, email: actorEmail } = await requireAdmin();

  const target = await prisma.user.findFirst({ where: { id: userId, companyId } });
  if (!target) throw new Error("User does not belong to your company");

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  await logAdminAction({ companyId, actorEmail, action: "team.reset_password", detail: `email=${target.email}` });
  revalidatePath("/settings");
  return { email: target.email, tempPassword };
}
