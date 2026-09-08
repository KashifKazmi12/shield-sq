"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Logo } from "@/components/Logo";
import {
  NavigationPendingProvider,
  NavigationPendingUI,
  usePendingRouter,
} from "@/components/NavigationPending";
import { ProjectSelect } from "@/components/ProjectSelect";
import { UserMenu } from "./UserMenu";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      {children}
    </svg>
  );
}

type NavItem = {
  href: string;
  label: string;
  icon?: ReactNode;
  /** Match only exact path (dashboard roots) so child routes don't double-highlight. */
  exact?: boolean;
};

type NavSection = {
  label: string;
  icon: ReactNode;
  items: NavItem[];
  /** Hide entire section for these roles. */
  hideForRoles?: string[];
};

const companySections: NavSection[] = [
  {
    label: "Vulnerabilities",
    icon: (
      <Icon>
        <path d="M8 .585 1 3.5v4.25c0 4.02 2.98 7.66 7 8.665 4.02-1.005 7-4.645 7-8.665V3.5Zm0 1.634 5.5 2.291v3.24c0 3.24-2.26 6.13-5.5 7.036-3.24-.906-5.5-3.796-5.5-7.036v-3.24Z" />
      </Icon>
    ),
    items: [
      { href: "/vulnerabilities", label: "Dashboard", exact: true },
      { href: "/vulnerabilities/findings", label: "Findings" },
      { href: "/runs", label: "Pipeline Runs" },
    ],
  },
  {
    label: "Runtime Alerts",
    icon: (
      <Icon>
        <path d="M8.22 1.754a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm-1.763-.707c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-.25-5.25a.75.75 0 0 0-1.5 0v2.5a.75.75 0 0 0 1.5 0Z" />
      </Icon>
    ),
    items: [
      { href: "/runtime-alerts", label: "Dashboard", exact: true },
      { href: "/runtime-alerts/feed", label: "Alerts" },
    ],
  },
  {
    label: "Settings",
    icon: (
      <Icon>
        <path d="m8.878.392 1.037.259a1 1 0 0 1 .75.928l.055 1.14a5.98 5.98 0 0 1 1.44.833l1.06-.44a1 1 0 0 1 1.166.361l.6.882a1 1 0 0 1-.166 1.32l-.867.75c.088.31.14.633.156.964l1.005.5a1 1 0 0 1 .49 1.21l-.34 1.01a1 1 0 0 1-1.1.667l-1.12-.19a5.98 5.98 0 0 1-.96 1.05l.19 1.12a1 1 0 0 1-.667 1.1l-1.01.34a1 1 0 0 1-1.21-.49l-.5-1.005a5.98 5.98 0 0 1-1.35 0l-.5 1.005a1 1 0 0 1-1.21.49l-1.01-.34a1 1 0 0 1-.667-1.1l.19-1.12a5.98 5.98 0 0 1-.96-1.05l-1.12.19a1 1 0 0 1-1.1-.667l-.34-1.01a1 1 0 0 1 .49-1.21l1.005-.5c.016-.33.068-.653.156-.964l-.867-.75a1 1 0 0 1-.166-1.32l.6-.882a1 1 0 0 1 1.166-.36l1.06.44a5.98 5.98 0 0 1 1.44-.833l.055-1.14a1 1 0 0 1 .75-.928Zm-.878 5.108a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
      </Icon>
    ),
    hideForRoles: ["viewer"],
    items: [{ href: "/settings", label: "Settings", exact: true }],
  },
];

const superAdminLinks: NavItem[] = [
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

function isActivePath(pathname: string | null, item: NavItem) {
  if (!pathname) return false;
  // Alert bucket detail lives under Runtime Alerts dashboard, not Pipeline Runs.
  if (item.href === "/runtime-alerts" && pathname.startsWith("/runtime-alerts/buckets")) {
    return true;
  }
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M1.75 3.5a.75.75 0 0 1 .75-.75h11a.75.75 0 0 1 0 1.5h-11a.75.75 0 0 1-.75-.75Zm0 4.5a.75.75 0 0 1 .75-.75h11a.75.75 0 0 1 0 1.5h-11A.75.75 0 0 1 1.75 8Zm0 4.5a.75.75 0 0 1 .75-.75h11a.75.75 0 0 1 0 1.5h-11a.75.75 0 0 1-.75-.75Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

export function DashboardShell({
  email,
  projects = [],
  defaultProjectId,
  role,
  companyName,
  children,
}: {
  email?: string | null;
  projects?: { id: string; name: string }[];
  defaultProjectId?: string;
  role?: string;
  companyName?: string | null;
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  return (
    <NavigationPendingProvider>
      <TopHeader
        email={email}
        projects={projects}
        defaultProjectId={defaultProjectId}
        onMenuClick={() => setNavOpen(true)}
      />
      <div className="app-body">
        <div
          className={`sidebar-backdrop${navOpen ? " open" : ""}`}
          onClick={() => setNavOpen(false)}
          aria-hidden={!navOpen}
        />
        <Sidebar
          role={role}
          companyName={companyName}
          open={navOpen}
          onClose={() => setNavOpen(false)}
        />
        <main className="main">
          <div className="main-scroll">{children}</div>
          <NavigationPendingUI />
        </main>
      </div>
    </NavigationPendingProvider>
  );
}

export function TopHeader({
  email,
  projects = [],
  defaultProjectId,
  onMenuClick,
}: {
  email?: string | null;
  projects?: { id: string; name: string }[];
  defaultProjectId?: string;
  onMenuClick?: () => void;
}) {
  return (
    <header className="top-header">
      <div className="brand">
        <button
          type="button"
          className="nav-menu-btn"
          aria-label="Open navigation"
          onClick={onMenuClick}
        >
          <MenuIcon />
        </button>
        <Logo size={34} />
        <div className="brand-text">
          <span className="brand-name">SQSecure</span>
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

function NavLink({
  item,
  projectId,
  onClose,
}: {
  item: NavItem;
  projectId: string | null;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { push } = usePendingRouter();
  const href = projectId ? `${item.href}?project=${encodeURIComponent(projectId)}` : item.href;
  const active = isActivePath(pathname, item);

  return (
    <Link
      href={href}
      className={active ? "active" : ""}
      onClick={(e) => {
        e.preventDefault();
        onClose?.();
        push(href);
      }}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}

export function Sidebar({
  role,
  companyName,
  open = false,
  onClose,
}: {
  role?: string;
  companyName?: string | null;
  open?: boolean;
  onClose?: () => void;
}) {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");
  const isSuperAdmin = role === "super_admin";
  const sectionLabel = isSuperAdmin ? "Platform" : companyName ?? "Dashboards";

  const sections = companySections.filter(
    (s) => !s.hideForRoles?.includes(role ?? "")
  );

  return (
    <nav className={`sidebar${open ? " open" : ""}`} aria-label="Main">
      <div className="sidebar-mobile-header">
        <div className="section-label" style={{ paddingTop: 0, paddingBottom: 0 }}>
          {sectionLabel}
        </div>
        <button
          type="button"
          className="sidebar-close-btn"
          aria-label="Close navigation"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="section-label sidebar-desktop-label">{sectionLabel}</div>

      {isSuperAdmin
        ? superAdminLinks.map((item) => (
            <NavLink key={item.href} item={item} projectId={projectId} onClose={onClose} />
          ))
        : sections.map((section) => {
            // Settings is a single-item section — render as a flat top-level link.
            if (section.items.length === 1 && section.items[0].href === "/settings") {
              return (
                <NavLink
                  key={section.label}
                  item={{ ...section.items[0], icon: section.icon, label: section.label }}
                  projectId={projectId}
                  onClose={onClose}
                />
              );
            }
            return (
              <div key={section.label} className="sidebar-group">
                <div className="sidebar-group-label">
                  {section.icon}
                  {section.label}
                </div>
                <div className="sidebar-group-items">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.href}
                      item={item}
                      projectId={projectId}
                      onClose={onClose}
                    />
                  ))}
                </div>
              </div>
            );
          })}

      <div className="section-label" style={{ marginTop: "auto" }}>
        Signed in as {role ?? "…"}
      </div>
    </nav>
  );
}
