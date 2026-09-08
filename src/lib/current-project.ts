import { prisma } from "./prisma";

/** Cookie name for the last-selected project (set via server action). */
export const CURRENT_PROJECT_COOKIE = "sqsecure_current_project";

// Every lookup is scoped to companyId — a project id from another tenant
// must never resolve here, even if a viewer guesses/pastes one in the URL.
export async function resolveProject(companyId: string, projectIdParam?: string) {
  if (projectIdParam) {
    const project = await prisma.project.findFirst({ where: { id: projectIdParam, companyId } });
    if (project) return project;
  }
  return prisma.project.findFirst({ where: { companyId }, orderBy: { createdAt: "asc" } });
}
