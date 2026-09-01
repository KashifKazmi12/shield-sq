"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateIngestToken, hashToken } from "@/lib/token";
import { SEVERITIES } from "@/lib/constants";

async function requireAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "admin" || !session.user.id || !session.user.companyId) {
    throw new Error("Forbidden: admin role required");
  }
  return session;
}

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
  const session = await requireAdminSession();

  const projectName = input.projectName.trim();
  if (!projectName) throw new Error("Project name is required");

  const severityThreshold = SEVERITIES.includes(input.severityThreshold as (typeof SEVERITIES)[number])
    ? input.severityThreshold
    : "critical";

  const rawToken = generateIngestToken();

  const project = await prisma.project.create({
    data: {
      name: projectName,
      companyId: session.user!.companyId as string,
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
    where: { id: session.user!.id },
    data: { onboardedAt: new Date() },
  });

  return { projectId: project.id, projectName: project.name, ingestToken: rawToken };
}

export async function skipOnboarding() {
  const session = await requireAdminSession();
  await prisma.user.update({
    where: { id: session.user!.id },
    data: { onboardedAt: new Date() },
  });
}
