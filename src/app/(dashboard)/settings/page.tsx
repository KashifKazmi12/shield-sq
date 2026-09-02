import { redirect } from "next/navigation";
import { requireCompanySession } from "@/lib/session";
import { resolveProject } from "@/lib/current-project";
import { listProjects } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { DataTable } from "@/components/DataTable";
import { PendingLink } from "@/components/PendingLink";
import { TokenManager } from "./TokenManager";
import { NotificationConfigForm } from "./NotificationConfigForm";
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
    redirect("/overview");
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
  const [tokens, notifyConfig, activity] = await Promise.all([
    prisma.ingestToken.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } }),
    prisma.notificationConfig.findUnique({ where: { projectId: project.id } }),
    prisma.adminAuditLog.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div>
      <h2 className="page-title">Settings — {project.name}</h2>

      <div className="card section">
        <h3>Projects</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Each project gets its own ingest tokens and notification config — add one per repo or cluster.
          Use the project menu in the top bar to switch which project Settings (and every other page) shows.
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
            key: "activity",
            label: "Activity",
            node: (
              <div className="card">
                <h3>Activity</h3>
                <p className="muted" style={{ marginTop: 0 }}>
                  Recent admin changes to your company's tokens, team, projects, and notification
                  config.
                </p>
                <DataTable
                  columns={[
                    { id: "when", header: "When" },
                    { id: "who", header: "Who", mobileFullWidth: true },
                    { id: "action", header: "Action" },
                    { id: "detail", header: "Detail", mobileFullWidth: true },
                  ]}
                  rows={activity.map((a) => ({
                    key: a.id,
                    cells: [
                      a.createdAt.toLocaleString(),
                      a.actorEmail,
                      a.action,
                      <span key="d" className="muted">{a.detail ?? ""}</span>,
                    ],
                  }))}
                  emptyMessage="No changes recorded yet."
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
