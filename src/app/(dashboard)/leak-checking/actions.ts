"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { LeakIdentifierType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireCompanyFeature } from "@/lib/rbac";
import { logAdminAction } from "@/lib/audit";
import { checkIdentity, QuotaExceededError } from "@/lib/leak-providers";
import { encryptSecret, decryptSecret } from "@/lib/secrets";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireOwnedIdentity(identityId: string, companyId: string) {
  const identity = await prisma.monitoredIdentity.findFirst({ where: { id: identityId, companyId } });
  if (!identity) throw new Error("Identity does not belong to your company");
  return identity;
}

// Shared by createIdentity's initial check and syncIdentity/syncAllIdentities
// — one code path so a future scheduler (see GAPS.md) can call the exact
// same logic without duplicating it.
async function runCheckAndReschedule(identityId: string, userId: string) {
  const identity = await prisma.monitoredIdentity.update({
    where: { id: identityId },
    data: { status: "pending", lastError: null },
  });

  try {
    const findings = await checkIdentity(identity.identifierValue, identity.identifierType, {
      companyId: identity.companyId,
      userId,
    });

    await prisma.$transaction(
      findings.map((f) =>
        prisma.leakFinding.upsert({
          where: { identityId_dedupeKey: { identityId, dedupeKey: f.dedupeKey } },
          // Re-syncing the same breach refreshes severity/date/password
          // instead of no-op'ing — a provider can return richer data on a
          // later call (or a bug fix like this one can backfill correctly
          // once re-synced), and there's nothing else on this row a re-sync
          // could regress.
          update: {
            severity: f.severity,
            leakedAt: f.leakedAt,
            details: f.details as Prisma.InputJsonValue,
            passwordCiphertext: f.rawPassword ? encryptSecret(f.rawPassword) : null,
          },
          create: {
            identityId,
            source: f.source,
            breachName: f.breachName,
            severity: f.severity,
            leakedAt: f.leakedAt,
            dedupeKey: f.dedupeKey,
            details: f.details as Prisma.InputJsonValue,
            passwordCiphertext: f.rawPassword ? encryptSecret(f.rawPassword) : null,
          },
        })
      )
    );

    await prisma.monitoredIdentity.update({
      where: { id: identityId },
      data: {
        status: "active",
        lastCheckedAt: new Date(),
        nextCheckAt: new Date(Date.now() + identity.checkIntervalMins * 60_000),
      },
    });
    return { findingsCount: findings.length };
  } catch (err) {
    const message = err instanceof QuotaExceededError ? err.message : "Leak check failed";
    await prisma.monitoredIdentity.update({
      where: { id: identityId },
      data: {
        status: "error",
        lastError: message,
        lastCheckedAt: new Date(),
        nextCheckAt: new Date(Date.now() + identity.checkIntervalMins * 60_000),
      },
    });
    if (err instanceof QuotaExceededError) throw err;
    return { findingsCount: 0, warning: message };
  }
}

export async function createIdentity(input: {
  identifierType: LeakIdentifierType;
  identifierValue: string;
}) {
  const { companyId, userId, email } = await requireAdmin();
  await requireCompanyFeature(companyId, "leak_checking");

  const identifierValue = input.identifierValue.trim().toLowerCase();
  if (!identifierValue) throw new Error("Value is required");
  if (input.identifierType === "email" && !EMAIL_RE.test(identifierValue)) {
    throw new Error("Enter a valid email address");
  }

  // v1 has no scheduler (see GAPS.md) — the user re-checks manually via
  // Sync/Sync all, so checkIntervalMins/nextCheckAt aren't exposed as
  // configurable; the column stays at its schema default for whenever a
  // scheduler is built.
  let identity;
  try {
    identity = await prisma.monitoredIdentity.create({
      data: {
        companyId,
        createdById: userId,
        identifierType: input.identifierType,
        identifierValue,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("This identity is already monitored");
    }
    throw err;
  }

  await logAdminAction({
    companyId,
    actorEmail: email,
    action: "leak_identity.create",
    detail: `${input.identifierType}=${identifierValue}`,
  });

  let warning: string | undefined;
  try {
    const result = await runCheckAndReschedule(identity.id, userId);
    warning = result.warning;
  } catch (err) {
    warning = err instanceof Error ? err.message : "Initial leak check failed";
  }

  revalidatePath("/leak-checking");
  return { identityId: identity.id, warning };
}

export async function syncIdentity(identityId: string) {
  const { companyId, userId, email } = await requireAdmin();
  await requireOwnedIdentity(identityId, companyId);
  await runCheckAndReschedule(identityId, userId);
  await logAdminAction({ companyId, actorEmail: email, action: "leak_identity.sync" });
  revalidatePath("/leak-checking");
}

export async function deleteIdentity(identityId: string) {
  const { companyId, email } = await requireAdmin();
  const identity = await requireOwnedIdentity(identityId, companyId);
  await prisma.monitoredIdentity.delete({ where: { id: identityId } });
  await logAdminAction({ companyId, actorEmail: email, action: "leak_identity.delete", detail: `${identity.identifierType}=${identity.identifierValue}` });
  revalidatePath("/leak-checking");
}

export async function listFindings(params: {
  identityId?: string;
  severity?: string;
  page?: number;
}) {
  const { companyId } = await requireAdmin();
  const page = params.page && params.page > 0 ? params.page : 1;

  let identityId = params.identityId;
  if (identityId) {
    const owned = await prisma.monitoredIdentity.findFirst({ where: { id: identityId, companyId } });
    if (!owned) identityId = "__none__";
  }

  const where = {
    identity: { companyId },
    ...(identityId ? { identityId } : {}),
    ...(params.severity ? { severity: params.severity } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.leakFinding.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
      include: { identity: { select: { identifierValue: true, identifierType: true } } },
    }),
    prisma.leakFinding.count({ where }),
  ]);

  // The encrypted password never leaves the server as part of the list
  // payload — only whether one exists, so the UI knows to show a "reveal"
  // control. The real value is fetched on demand via revealFindingPassword.
  const sanitized = rows.map(({ passwordCiphertext, ...rest }) => ({
    ...rest,
    hasPassword: passwordCiphertext != null,
  }));

  return { rows: sanitized, total, page, pageSize: DEFAULT_PAGE_SIZE };
}

export async function revealFindingPassword(findingId: string) {
  const { companyId, email } = await requireAdmin();
  const finding = await prisma.leakFinding.findFirst({
    where: { id: findingId, identity: { companyId } },
    select: { passwordCiphertext: true, breachName: true },
  });
  if (!finding?.passwordCiphertext) throw new Error("No password available for this finding");

  await logAdminAction({
    companyId,
    actorEmail: email,
    action: "leak_finding.reveal_password",
    detail: `breach=${finding.breachName}`,
  });

  return { password: decryptSecret(finding.passwordCiphertext) };
}
