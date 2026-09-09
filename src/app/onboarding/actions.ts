"use server";

import { prisma } from "@/lib/prisma";
import { generateIngestToken, hashToken } from "@/lib/token";
import { SEVERITIES } from "@/lib/constants";
import { requireAdmin } from "@/lib/rbac";

export type OnboardingResult = {
  projectId: string;
  projectName: string;
  ingestToken: string;
};

export async function completeOnboarding(input: {
  projectName: string;
  slackWebhookUrl: string;
  notifyEmail: string;
  severityThreshold: string;
}): Promise<OnboardingResult> {
  const { companyId, userId } = await requireAdmin();

  const projectName = input.projectName.trim();
  if (!projectName) throw new Error("Project name is required");

  const severityThreshold = SEVERITIES.includes(input.severityThreshold as (typeof SEVERITIES)[number])
    ? input.severityThreshold
    : "critical";

  const rawToken = generateIngestToken();

  const project = await prisma.project.create({
    data: {
      name: projectName,
      companyId,
      tokens: {
        create: { tokenHash: hashToken(rawToken), label: "initial-setup" },
      },
      notifyConfig: {
        create: {
          slackWebhookUrl: input.slackWebhookUrl.trim() || null,
          notifyEmail: input.notifyEmail.trim() || null,
          severityThreshold,
        },
      },
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { onboardedAt: new Date() },
  });

  return { projectId: project.id, projectName: project.name, ingestToken: rawToken };
}

export async function skipOnboarding() {
  const { userId } = await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: { onboardedAt: new Date() },
  });
}
