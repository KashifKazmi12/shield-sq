"use server";

import { prisma } from "@/lib/prisma";
import { requireCompanySession } from "@/lib/session";
import { requireAdmin, requireCompanyFeature } from "@/lib/rbac";
import { runAiPrompt, getCachedInsight, NoActiveAiProviderError, DailyAiCapExceededError } from "@/lib/ai-runtime";
import { buildExplanationPrompt, buildTriagePrompt, buildCorrelationPrompt, type FindingSummary, type TriageFindingInput } from "@/lib/ai-prompts";
import { AiProviderCallError } from "@/lib/ai-client";
import { EVENT_STREAM_TOOLS } from "@/lib/finding-lifecycle";
import { z } from "zod";

async function requireOwnedFinding(findingId: string, companyId: string) {
  const finding = await prisma.finding.findFirst({
    where: { id: findingId, project: { companyId } },
  });
  if (!finding) throw new Error("Finding does not belong to your company");
  return finding;
}

function toFindingSummary(finding: { tool: string; title: string; severity: string; description: string | null; resource: string | null; ruleName: string | null; fixedVersion: string | null; rawContext: unknown }): FindingSummary {
  return {
    tool: finding.tool,
    title: finding.title,
    severity: finding.severity,
    description: finding.description,
    resource: finding.resource,
    ruleName: finding.ruleName,
    fixedVersion: finding.fixedVersion,
    rawContext: finding.rawContext,
  };
}

function friendlyAiError(err: unknown): string {
  if (err instanceof NoActiveAiProviderError || err instanceof DailyAiCapExceededError || err instanceof AiProviderCallError) {
    return err.message;
  }
  return "AI request failed";
}

export async function explainFinding(findingId: string, options?: { regenerate?: boolean }) {
  const { companyId } = await requireCompanySession();
  await requireCompanyFeature(companyId, "ai_assistant");
  const finding = await requireOwnedFinding(findingId, companyId);

  if (!options?.regenerate) {
    const cached = await getCachedInsight(companyId, "explanation", findingId);
    if (cached) return { content: cached.content };
  }

  try {
    const prompt = buildExplanationPrompt(toFindingSummary(finding));
    return await runAiPrompt(companyId, { kind: "explanation", findingId, prompt, maxTokens: 300 });
  } catch (err) {
    throw new Error(friendlyAiError(err));
  }
}

export async function correlateAlert(findingId: string) {
  const { companyId } = await requireCompanySession();
  await requireCompanyFeature(companyId, "ai_assistant");
  const finding = await requireOwnedFinding(findingId, companyId);
  if (!(EVENT_STREAM_TOOLS as readonly string[]).includes(finding.tool)) {
    throw new Error("Correlation is only available for runtime alerts");
  }

  const windowMs = 60 * 60 * 1000;
  const related = await prisma.finding.findMany({
    where: {
      id: { not: findingId },
      projectId: finding.projectId,
      tool: finding.tool,
      resource: finding.resource,
      status: "opened",
      detectedAt: {
        gte: new Date(finding.detectedAt.getTime() - windowMs),
        lte: new Date(finding.detectedAt.getTime() + windowMs),
      },
    },
    orderBy: { detectedAt: "asc" },
    take: 10,
  });

  if (related.length === 0) {
    return { related: [], summary: null };
  }

  const cached = await getCachedInsight(companyId, "correlation", findingId);
  let summary = cached?.content ?? null;
  if (!summary) {
    try {
      const prompt = buildCorrelationPrompt(toFindingSummary(finding), related.map(toFindingSummary));
      const result = await runAiPrompt(companyId, { kind: "correlation", findingId, prompt, maxTokens: 250 });
      summary = result.content;
    } catch {
      summary = null; // correlation grouping itself still works without the AI summary
    }
  }

  return {
    related: related.map((f) => ({ id: f.id, title: f.title, detectedAt: f.detectedAt.toISOString() })),
    summary,
  };
}

const triageResponseSchema = z.array(z.object({ id: z.string(), score: z.number().min(1).max(100), reason: z.string() }));

export async function triagePriority(projectId: string) {
  const { companyId } = await requireAdmin();
  await requireCompanyFeature(companyId, "ai_assistant");
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId } });
  if (!project) throw new Error("Project does not belong to your company");

  const findings = await prisma.finding.findMany({
    where: { projectId, tool: "trivy", status: { in: ["opened", "reopened"] } },
    orderBy: { detectedAt: "desc" },
    take: 50,
    select: { id: true, title: true, severity: true, resource: true },
  });
  if (findings.length === 0) return { updated: 0 };

  const input: TriageFindingInput[] = findings;
  let parsed;
  try {
    const prompt = buildTriagePrompt(input);
    const result = await runAiPrompt(companyId, { kind: "priority", prompt, maxTokens: 2000 });
    const json = JSON.parse(result.content.trim().replace(/^```json\s*|\s*```$/g, ""));
    parsed = triageResponseSchema.parse(json);
  } catch (err) {
    if (err instanceof NoActiveAiProviderError || err instanceof DailyAiCapExceededError) throw new Error(friendlyAiError(err));
    throw new Error("Couldn't parse the model's response — try again");
  }

  const validIds = new Set(findings.map((f) => f.id));
  const toApply = parsed.filter((p) => validIds.has(p.id));
  await prisma.$transaction(
    toApply.map((p) =>
      prisma.finding.update({ where: { id: p.id }, data: { aiPriorityScore: p.score, aiPriorityReason: p.reason } })
    )
  );

  return { updated: toApply.length };
}
