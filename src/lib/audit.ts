import { prisma } from "./prisma";

export async function logRejectedIngest(params: {
  source: "trivy" | "falco";
  projectId?: string;
  reason: string;
  detail?: string;
}) {
  await prisma.ingestAuditLog.create({
    data: {
      source: params.source,
      projectId: params.projectId,
      reason: params.reason,
      detail: params.detail,
    },
  });
}

// Records an admin-driven change (token/team/project/notification config) so
// "who changed this and when" has an answer without server log access. Best
// effort: a logging failure shouldn't roll back the change it's describing.
export async function logAdminAction(params: {
  companyId: string;
  actorEmail: string;
  action: string;
  detail?: string;
}) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        companyId: params.companyId,
        actorEmail: params.actorEmail,
        action: params.action,
        detail: params.detail,
      },
    });
  } catch {
    // Non-fatal — the mutation itself already succeeded.
  }
}
