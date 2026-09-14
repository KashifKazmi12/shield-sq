import { prisma } from "./prisma";

// Free-form rather than a literal union: every new ingest route (Semgrep,
// gitleaks, trivy-license, iac-misconfig, kube-bench, cloudsplaining,
// file-integrity, ...) passes its own tool name here, and none of them need
// type-level enforcement beyond "it's the string the route already uses" —
// IngestAuditLog.source in schema.prisma is a plain String for the same reason.
export async function logRejectedIngest(params: {
  source: string;
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
