import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompanySession } from "@/lib/session";
import { resolveProject } from "@/lib/current-project";
import { listProjects } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
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
        <table>
          <thead>
            <tr><th>Name</th><th>Created</th><th></th></tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.createdAt.toLocaleDateString()}</td>
                <td>
                  {p.id === project.id ? (
                    <span className="badge badge-status-success">selected</span>
                  ) : (
                    <Link href={`/settings?project=${p.id}`}>Select</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
                {activity.length === 0 ? (
                  <p className="muted">No changes recorded yet.</p>
                ) : (
                  <table>
                    <thead>
                      <tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr>
                    </thead>
                    <tbody>
                      {activity.map((a) => (
                        <tr key={a.id}>
                          <td>{a.createdAt.toLocaleString()}</td>
                          <td>{a.actorEmail}</td>
                          <td>{a.action}</td>
                          <td className="muted">{a.detail ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
