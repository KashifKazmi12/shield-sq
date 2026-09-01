"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ProjectSelect } from "@/components/ProjectSelect";
import { UserMenu } from "./UserMenu";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      {children}
    </svg>
  );
}

const companyLinks = [
  {
    href: "/overview",
    label: "Overview",
    icon: <Icon><path d="M1 2.75A.75.75 0 0 1 1.75 2h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 1 7.25Zm7 0A.75.75 0 0 1 8.75 2h4.5a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 8 5.25ZM1 10.75a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75Zm7-2a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75Z" /></Icon>,
  },
  {
    href: "/vulnerabilities",
    label: "Vulnerabilities",
    icon: <Icon><path d="M8 .585 1 3.5v4.25c0 4.02 2.98 7.66 7 8.665 4.02-1.005 7-4.645 7-8.665V3.5Zm0 1.634 5.5 2.291v3.24c0 3.24-2.26 6.13-5.5 7.036-3.24-.906-5.5-3.796-5.5-7.036v-3.24Z" /></Icon>,
  },
  {
    href: "/runtime-alerts",
    label: "Runtime Alerts",
    icon: <Icon><path d="M8.22 1.754a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm-1.763-.707c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-.25-5.25a.75.75 0 0 0-1.5 0v2.5a.75.75 0 0 0 1.5 0Z" /></Icon>,
  },
  {
    href: "/runs",
    label: "Pipeline Runs",
    icon: (
      <Icon>
        <rect x="0.5" y="6.25" width="3.5" height="3.5" rx="0.9" />
        <rect x="6.25" y="6.25" width="3.5" height="3.5" rx="0.9" />
        <rect x="12" y="6.25" width="3.5" height="3.5" rx="0.9" />
        <rect x="4" y="7.4" width="2.25" height="1.2" />
        <rect x="9.75" y="7.4" width="2.25" height="1.2" />
      </Icon>
    ),
  },
  {
    href: "/trends",
    label: "Trends",
    icon: <Icon><path d="M1.5 1.75V13.5h13.75a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75V1.75a.75.75 0 0 1 1.5 0Zm14.28 2.53-5.25 5.25a.75.75 0 0 1-1.06 0L7 7.06 4.28 9.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.25-3.25a.75.75 0 0 1 1.06 0L10 7.94l4.72-4.72a.75.75 0 1 1 1.06 1.06Z" /></Icon>,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: <Icon><path d="m8.878.392 1.037.259a1 1 0 0 1 .75.928l.055 1.14a5.98 5.98 0 0 1 1.44.833l1.06-.44a1 1 0 0 1 1.166.361l.6.882a1 1 0 0 1-.166 1.32l-.867.75c.088.31.14.633.156.964l1.005.5a1 1 0 0 1 .49 1.21l-.34 1.01a1 1 0 0 1-1.1.667l-1.12-.19a5.98 5.98 0 0 1-.96 1.05l.19 1.12a1 1 0 0 1-.667 1.1l-1.01.34a1 1 0 0 1-1.21-.49l-.5-1.005a5.98 5.98 0 0 1-1.35 0l-.5 1.005a1 1 0 0 1-1.21.49l-1.01-.34a1 1 0 0 1-.667-1.1l.19-1.12a5.98 5.98 0 0 1-.96-1.05l-1.12.19a1 1 0 0 1-1.1-.667l-.34-1.01a1 1 0 0 1 .49-1.21l1.005-.5c.016-.33.068-.653.156-.964l-.867-.75a1 1 0 0 1-.166-1.32l.6-.882a1 1 0 0 1 1.166-.36l1.06.44a5.98 5.98 0 0 1 1.44-.833l.055-1.14a1 1 0 0 1 .75-.928Zm-.878 5.108a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" /></Icon>,
  },
];

const superAdminLinks = [
  {
    href: "/companies",
    label: "Companies",
    icon: (
      <Icon>
        <rect x="1" y="6" width="5" height="9" rx="0.6" />
        <rect x="7.5" y="2" width="5" height="13" rx="0.6" />
        <rect x="13.5" y="8" width="1.5" height="7" rx="0.4" />
      </Icon>
    ),
  },
];

// Takes the signed-in user's email as a prop from the server-rendered
// layout (which already has the session via getServerSession) rather than
// re-fetching it client-side with useSession() — that hook starts out
// `undefined` on every page refresh until its own /api/auth/session round
// trip resolves, which showed up as a "?" avatar flash before the real
// initials could render.
export function TopHeader({
  email,
  projects = [],
  defaultProjectId,
}: {
  email?: string | null;
  projects?: { id: string; name: string }[];
  defaultProjectId?: string;
}) {
  return (
    <header className="top-header">
      <div className="brand">
        <Logo size={34} />
        <div className="brand-text">
          <span className="brand-name">ShieldSQ</span>
          <span className="brand-sub">A product by SecureQuanta</span>
        </div>
      </div>
      <div className="right">
        {projects.length > 0 && (
          <ProjectSelect projects={projects} defaultId={defaultProjectId} />
        )}
        <UserMenu email={email} />
      </div>
    </header>
  );
}

export function Sidebar({ role, companyName }: { role?: string; companyName?: string | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");
  const isSuperAdmin = role === "super_admin";
  // A viewer has nothing to configure (token/team/project/notification
  // management is admin-only, and password change now lives in the header's
  // account menu, not Settings) — no point linking to an empty page.
  const links = isSuperAdmin
    ? superAdminLinks
    : role === "viewer"
      ? companyLinks.filter((l) => l.href !== "/settings")
      : companyLinks;
  const sectionLabel = isSuperAdmin ? "Platform" : companyName ?? "Dashboards";

  return (
    <nav className="sidebar">
      <div className="section-label">{sectionLabel}</div>
      {links.map((link) => {
        const href = projectId ? `${link.href}?project=${encodeURIComponent(projectId)}` : link.href;
        return (
          <Link
            key={link.href}
            href={href}
            className={pathname?.startsWith(link.href) ? "active" : ""}
          >
            {link.icon}
            {link.label}
          </Link>
        );
      })}
      <div className="section-label" style={{ marginTop: "auto" }}>
        Signed in as {role ?? "…"}
      </div>
    </nav>
  );
}
