import { redirect } from "next/navigation";
import { requireCompanySession } from "@/lib/session";
import { resolveProject } from "@/lib/current-project";
import { listProjects } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { DataTable } from "@/components/DataTable";
import { PendingLink } from "@/components/PendingLink";
import { TokenManager } from "./TokenManager";
import { NotificationConfigForm } from "./NotificationConfigForm";
import { CompanyNotificationConfigForm } from "./CompanyNotificationConfigForm";
import { AiAssistantForm } from "./AiAssistantForm";
import { ActivityList } from "./ActivityList";
import { NewProjectForm } from "./NewProjectForm";
import { TeamManager } from "./TeamManager";
import { SettingsTabs } from "./SettingsTabs";

export default async function SettingsPage({
  searchParams,
}: {
  // Next 16: page-level searchParams is a Promise (Async Request APIs).
  searchParams: Promise<{ project?: string }>;
}) {
  const { session, companyId } = await requireCompanySession();
  const isAdmin = session.user?.role === "admin";

  // A viewer has nothing left to configure here — token/project/team/
  // notification management is admin-only, and password change now lives in
  // the header's account menu, not Settings (see UserMenu.tsx).
  if (!isAdmin) {
    redirect("/vulnerabilities");
  }

  const { project: projectParam } = await searchParams;
  const project = await resolveProject(companyId, projectParam);
  const currentUserId = session.user!.id as string;

  const teammates = await prisma.user.findMany({
    where: { companyId },
    select: { id: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (!project) {
    return (
      <div>
        <h2 className="page-title">Settings</h2>
        <div className="card section">
          <h3>Team</h3>
          <TeamManager teammates={teammates} currentUserId={currentUserId} />
        </div>
        <div className="card">
          <h3>Create your first project</h3>
          <NewProjectForm />
        </div>
      </div>
    );
  }

  const projects = await listProjects(companyId);
  const ACTIVITY_TAKE = 7;
  const AI_USAGE_TAKE = 7;
  const [tokens, notifyConfig, companyNotifyConfig, activityRows, company, aiConfigs, aiUsageTotals, aiUsageRows] =
    await Promise.all([
      prisma.ingestToken.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } }),
      prisma.notificationConfig.findUnique({ where: { projectId: project.id } }),
      prisma.companyNotificationConfig.findUnique({ where: { companyId } }),
      prisma.adminAuditLog.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: ACTIVITY_TAKE + 1 }),
      prisma.company.findUnique({ where: { id: companyId }, select: { features: true } }),
      prisma.aiProviderConfig.findMany({ where: { companyId } }),
      prisma.aiUsageLog.aggregate({ where: { companyId }, _count: { _all: true }, _sum: { totalTokens: true } }),
      prisma.aiUsageLog.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: AI_USAGE_TAKE + 1 }),
    ]);
  const hasAiFeature = company?.features.includes("ai_assistant") ?? false;

  const activityHasMore = activityRows.length > ACTIVITY_TAKE;
  const activity = activityHasMore ? activityRows.slice(0, ACTIVITY_TAKE) : activityRows;
  const activityNextCursor = activityHasMore ? activity[activity.length - 1].id : null;

  const aiUsageHasMore = aiUsageRows.length > AI_USAGE_TAKE;
  const aiUsageRecent = aiUsageHasMore ? aiUsageRows.slice(0, AI_USAGE_TAKE) : aiUsageRows;
  const aiUsageNextCursor = aiUsageHasMore ? aiUsageRecent[aiUsageRecent.length - 1].id : null;

  return (
    <div>
      <h2 className="page-title">Settings — {project.name}</h2>

      <div className="card section">
        <h3>Projects</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Each project gets its own ingest tokens and notification config.
          Use one ingest token per repo. Use the project menu in the top bar to switch which project Settings shows.
        </p>
        <DataTable
          columns={[
            { id: "name", header: "Name", mobileFullWidth: true },
            { id: "created", header: "Created" },
            { id: "actions", header: "", mobileHideLabel: true },
          ]}
          rows={projects.map((p) => ({
            key: p.id,
            cells: [
              p.name,
              p.createdAt.toLocaleDateString(),
              p.id === project.id ? (
                <span key="sel" className="badge badge-status-success">selected</span>
              ) : (
                <PendingLink key="link" href={`/settings?project=${p.id}`}>Select</PendingLink>
              ),
            ],
          }))}
          emptyMessage="No projects yet."
        />
        <div style={{ marginTop: 16 }}><NewProjectForm /></div>
      </div>

      <SettingsTabs
        defaultTab="team"
        tabs={[
          {
            key: "team",
            label: "Team",
            node: (
              <div className="card">
                <h3>Team</h3>
                <p className="muted" style={{ marginTop: 0 }}>
                  Add another admin or viewer to your company — they get a temporary password to
                  log in with, shown once.
                </p>
                <TeamManager teammates={teammates} currentUserId={currentUserId} />
              </div>
            ),
          },
          {
            key: "tokens",
            label: "Ingest tokens",
            node: (
              <div className="card">
                <h3>Ingest tokens</h3>
                <TokenManager projectId={project.id} tokens={tokens} />
              </div>
            ),
          },
          {
            key: "notifications",
            label: "Notifications",
            node: (
              <div className="card">
                <h3>Notifications</h3>
                <NotificationConfigForm projectId={project.id} config={notifyConfig} />
              </div>
            ),
          },
          {
            key: "leak-alerts",
            label: "Leak alerts",
            node: (
              <div className="card">
                <h3>Leak &amp; identity DNS alerts</h3>
                <CompanyNotificationConfigForm config={companyNotifyConfig} />
              </div>
            ),
          },
          ...(hasAiFeature
            ? [
                {
                  key: "ai-assistant",
                  label: "AI Assistant",
                  node: (
                    <div className="card">
                      <h3>AI Assistant</h3>
                      <AiAssistantForm
                        configs={aiConfigs.map((c) => ({
                          provider: c.provider,
                          model: c.model,
                          apiKeyPreview: c.apiKeyPreview,
                          isActive: c.isActive,
                          hasKey: c.apiKeyCiphertext != null,
                        }))}
                        usage={{
                          totalCalls: aiUsageTotals._count._all,
                          totalTokens: aiUsageTotals._sum.totalTokens ?? 0,
                          recent: aiUsageRecent.map((r) => ({
                            id: r.id,
                            provider: r.provider,
                            model: r.model,
                            totalTokens: r.totalTokens,
                            success: r.success,
                            createdAt: r.createdAt.toISOString(),
                            detail: r.detail,
                          })),
                          nextCursor: aiUsageNextCursor,
                        }}
                      />
                    </div>
                  ),
                },
              ]
            : []),
          {
            key: "activity",
            label: "Activity",
            node: (
              <div className="card">
                <h3>Activity</h3>
                <p className="muted" style={{ marginTop: 0 }}>
                  Recent admin changes to your company's tokens, team, projects, and notification
                  config.
                </p>
                <ActivityList
                  initialRows={activity.map((a) => ({
                    id: a.id,
                    createdAt: a.createdAt.toISOString(),
                    actorEmail: a.actorEmail,
                    action: a.action,
                    detail: a.detail,
                  }))}
                  initialCursor={activityNextCursor}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
