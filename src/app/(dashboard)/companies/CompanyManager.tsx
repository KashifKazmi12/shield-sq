"use client";

import { Fragment, useState, useTransition, type ReactNode } from "react";
import { CopyButton } from "@/components/CopyButton";
import {
  createCompany,
  suspendCompany,
  reactivateCompany,
  resetCompanyAdminPassword,
  updateCompanyFeatures,
  setCompanyOwner,
} from "./actions";
import type { CompanyFeature } from "@prisma/client";

const FEATURE_OPTIONS: { value: CompanyFeature; label: string }[] = [
  { value: "vulnerabilities", label: "Vulnerabilities" },
  { value: "runtime_alerts", label: "Runtime Alerts" },
  { value: "leak_checking", label: "Leak Checking" },
  { value: "url_monitoring", label: "URL Monitoring" },
];

type Company = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date | string;
  suspendedAt: Date | string | null;
  features: CompanyFeature[];
  owner: { id: string; email: string } | null;
  users: { id: string; email: string; role: string; createdAt: Date | string }[];
  projects: { id: string; name: string; createdAt: Date | string }[];
  _count: { users: number; projects: number };
};

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString();
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.12s ease" }}
    >
      <path d="M4.427 6.427 8 10l3.573-3.573a.25.25 0 0 1 .354.354l-3.75 3.75a.25.25 0 0 1-.354 0l-3.75-3.75a.25.25 0 0 1 .354-.354Z" />
    </svg>
  );
}

// Read-only nested table — Projects/Users for one company's expanded row.
function DetailTable({
  title,
  columns,
  rows,
  emptyMessage,
}: {
  title: string;
  columns: string[];
  rows: ReactNode[][];
  emptyMessage: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 240 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>{title}</h4>
      {rows.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          {emptyMessage}
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, i) => (
              <tr key={i}>
                {cells.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FeatureToggles({
  selected,
  onChange,
  disabled,
}: {
  selected: CompanyFeature[];
  onChange: (features: CompanyFeature[]) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {FEATURE_OPTIONS.map((opt) => (
        <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={selected.includes(opt.value)}
            disabled={disabled}
            onChange={(e) => {
              onChange(
                e.target.checked
                  ? [...selected, opt.value]
                  : selected.filter((f) => f !== opt.value)
              );
            }}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

export function CompanyManager({ companies }: { companies: Company[] }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [features, setFeatures] = useState<CompanyFeature[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ companyName: string; adminEmail: string; adminPassword: string } | null>(null);
  const [resetResult, setResetResult] = useState<{ adminEmail: string; newPassword: string } | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [featuresModalCompany, setFeaturesModalCompany] = useState<Company | null>(null);
  const [modalFeatures, setModalFeatures] = useState<CompanyFeature[]>([]);
  const [featureError, setFeatureError] = useState<string | null>(null);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(companyId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  }

  const filteredCompanies = companies.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "suspended" ? !!c.suspendedAt : !c.suspendedAt);
    return matchesSearch && matchesStatus;
  });

  function handleOpenCreateModal() {
    setError(null);
    setCompanyName("");
    setAdminEmail("");
    setAdminPassword("");
    setFeatures([]);
    setShowCreateModal(true);
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createCompany({ companyName, adminEmail, adminPassword, features });
        setCreated({ companyName: result.companyName, adminEmail: result.adminEmail, adminPassword });
        setShowCreateModal(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function handleOpenFeaturesModal(company: Company) {
    setFeatureError(null);
    setModalFeatures(company.features);
    setFeaturesModalCompany(company);
  }

  function handleSaveFeatures() {
    if (!featuresModalCompany) return;
    const companyId = featuresModalCompany.id;
    setFeatureError(null);
    startTransition(async () => {
      try {
        await updateCompanyFeatures(companyId, modalFeatures);
        setFeaturesModalCompany(null);
      } catch (err) {
        setFeatureError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function handleSuspend(id: string) {
    startTransition(async () => {
      await suspendCompany(id);
    });
  }

  function handleReactivate(id: string) {
    startTransition(async () => {
      await reactivateCompany(id);
    });
  }

  function handleSetOwner(companyId: string, userId: string) {
    setOwnerError(null);
    startTransition(async () => {
      try {
        await setCompanyOwner(companyId, userId);
      } catch (err) {
        setOwnerError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function handleResetPassword(id: string) {
    setResetError(null);
    startTransition(async () => {
      try {
        const result = await resetCompanyAdminPassword(id);
        setResetResult(result);
      } catch (err) {
        setResetError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div>
      {created && (
        <div className="card section" style={{ borderColor: "var(--attention-fg)", background: "var(--attention-subtle)" }}>
          <strong>&ldquo;{created.companyName}&rdquo; created — share these credentials with the admin:</strong>
          <p style={{ margin: "8px 0 2px", fontSize: 13, fontWeight: 600 }}>Email</p>
          <pre style={{ margin: 0 }}>{created.adminEmail}</pre>
          <p style={{ margin: "8px 0 2px", fontSize: 13, fontWeight: 600 }}>Temporary password</p>
          <pre style={{ margin: 0 }}>{created.adminPassword}</pre>
          <button className="secondary" style={{ marginTop: 12 }} onClick={() => setCreated(null)}>
            Dismiss
          </button>
        </div>
      )}

      {resetResult && (
        <div className="card section" style={{ borderColor: "var(--attention-fg)", background: "var(--attention-subtle)" }}>
          <strong>Password reset — share the new credentials with the admin:</strong>
          <p style={{ margin: "8px 0 2px", fontSize: 13, fontWeight: 600 }}>Email</p>
          <pre style={{ margin: 0 }}>{resetResult.adminEmail}</pre>
          <p style={{ margin: "8px 0 2px", fontSize: 13, fontWeight: 600 }}>New temporary password</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <pre style={{ margin: 0, flex: 1 }}>{resetResult.newPassword}</pre>
            <CopyButton value={resetResult.newPassword} />
          </div>
          <button className="secondary" style={{ marginTop: 12 }} onClick={() => setResetResult(null)}>
            Dismiss
          </button>
        </div>
      )}
      {resetError && <p style={{ color: "var(--danger-fg)", fontSize: 13 }}>{resetError}</p>}
      {ownerError && <p style={{ color: "var(--danger-fg)", fontSize: 13 }}>{ownerError}</p>}

      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Companies</h3>
          <button onClick={handleOpenCreateModal}>New company</button>
        </div>
        <div className="toolbar">
          <input
            type="text"
            placeholder="Search by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="all">Status: All</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        {filteredCompanies.length === 0 ? (
          <p className="muted data-table-empty">
            {companies.length === 0 ? "No companies yet." : "No companies match these filters."}
          </p>
        ) : (
          <div className="data-table-desktop-wrap">
            <table className="company-tree-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }} />
                  <th>Name</th>
                  <th>Owner Email</th>
                  <th>Users</th>
                  <th>Projects</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Features</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map((c) => {
                  const admins = c.users.filter((u) => u.role === "admin");
                  const isOpen = expanded.has(c.id);
                  return (
                    <Fragment key={c.id}>
                      <tr>
                        <td>
                          <button
                            type="button"
                            className="tree-toggle"
                            aria-expanded={isOpen}
                            aria-label={isOpen ? "Collapse" : "Expand"}
                            onClick={() => toggleExpanded(c.id)}
                          >
                            <ChevronIcon expanded={isOpen} />
                          </button>
                        </td>
                        <td>{c.name}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {admins.length > 1 ? (
                            <select
                              value={c.owner?.id ?? ""}
                              disabled={isPending}
                              onChange={(e) => handleSetOwner(c.id, e.target.value)}
                            >
                              {!c.owner && <option value="">— no owner —</option>}
                              {admins.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.email}
                                </option>
                              ))}
                            </select>
                          ) : (
                            (c.owner?.email ?? "—")
                          )}
                        </td>
                        <td>{c._count.users}</td>
                        <td>{c._count.projects}</td>
                        <td>{fmtDate(c.createdAt)}</td>
                        <td>
                          <span className={`badge ${c.suspendedAt ? "badge-status-failed" : "badge-status-success"}`}>
                            {c.suspendedAt ? "suspended" : "active"}
                          </span>
                        </td>
                        <td>
                          <button className="secondary" onClick={() => handleOpenFeaturesModal(c)} disabled={isPending}>
                            {c.features.length} / {FEATURE_OPTIONS.length} features
                          </button>
                        </td>
                        <td>
                          <div className="toolbar" style={{ margin: 0 }} onClick={(e) => e.stopPropagation()}>
                            {c.suspendedAt ? (
                              <button className="secondary" onClick={() => handleReactivate(c.id)} disabled={isPending}>
                                Reactivate
                              </button>
                            ) : (
                              <button className="danger" onClick={() => handleSuspend(c.id)} disabled={isPending}>
                                Suspend
                              </button>
                            )}
                            <button className="secondary" onClick={() => handleResetPassword(c.id)} disabled={isPending}>
                              Reset password
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="company-detail-row">
                          <td colSpan={9}>
                            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                              <DetailTable
                                title={`Projects (${c.projects.length})`}
                                columns={["Name", "Created"]}
                                rows={c.projects.map((p) => [p.name, fmtDate(p.createdAt)])}
                                emptyMessage="No projects yet."
                              />
                              <DetailTable
                                title={`Users (${c.users.length})`}
                                columns={["Email", "Role", "Joined"]}
                                rows={c.users.map((u) => [u.email, u.role, fmtDate(u.createdAt)])}
                                emptyMessage="No users yet."
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>New company</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Company name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Acme Corp"
                style={{ display: "block", width: "100%" }}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Admin email</label>
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@acme.example"
                style={{ display: "block", width: "100%" }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Temporary password
              </label>
              <input
                type="text"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="At least 8 characters"
                style={{ display: "block", width: "100%" }}
              />
            </div>
            <div style={{ marginBottom: 4 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Features</label>
              <FeatureToggles selected={features} onChange={setFeatures} disabled={isPending} />
            </div>
            {error && <p style={{ color: "var(--danger-fg)", fontSize: 13, marginTop: 12 }}>{error}</p>}
            <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 20, marginBottom: 0 }}>
              <button
                type="button"
                className="secondary"
                disabled={isPending}
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={isPending || !companyName || !adminEmail || !adminPassword || features.length === 0}
              >
                Create company
              </button>
            </div>
          </div>
        </div>
      )}

      {featuresModalCompany && (
        <div className="modal-backdrop" onClick={() => setFeaturesModalCompany(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Features — {featuresModalCompany.name}</h3>
            <FeatureToggles selected={modalFeatures} onChange={setModalFeatures} disabled={isPending} />
            {featureError && (
              <p style={{ color: "var(--danger-fg)", fontSize: 13, marginTop: 12 }}>{featureError}</p>
            )}
            <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 20, marginBottom: 0 }}>
              <button
                type="button"
                className="secondary"
                disabled={isPending}
                onClick={() => setFeaturesModalCompany(null)}
              >
                Cancel
              </button>
              <button onClick={handleSaveFeatures} disabled={isPending || modalFeatures.length === 0}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
