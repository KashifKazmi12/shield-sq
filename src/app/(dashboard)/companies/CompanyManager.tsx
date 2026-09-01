"use client";

import { useState, useTransition } from "react";
import { createCompany, suspendCompany, reactivateCompany, resetCompanyAdminPassword } from "./actions";
import { CopyButton } from "@/components/CopyButton";

type Company = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date | string;
  suspendedAt: Date | string | null;
  _count: { users: number; projects: number };
};

export function CompanyManager({ companies }: { companies: Company[] }) {
  const [companyName, setCompanyName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ companyName: string; adminEmail: string; adminPassword: string } | null>(null);
  const [resetResult, setResetResult] = useState<{ adminEmail: string; newPassword: string } | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");

  const filteredCompanies = companies.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "suspended" ? !!c.suspendedAt : !c.suspendedAt);
    return matchesSearch && matchesStatus;
  });

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createCompany({ companyName, adminEmail, adminPassword });
        setCreated({ companyName: result.companyName, adminEmail: result.adminEmail, adminPassword });
        setCompanyName("");
        setAdminEmail("");
        setAdminPassword("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
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

      <div className="card section">
        <h3>New company</h3>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Company name</label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Acme Corp"
            style={{ display: "block", width: "100%" }}
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
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Temporary password</label>
          <input
            type="text"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="At least 8 characters"
            style={{ display: "block", width: "100%" }}
          />
        </div>
        {error && <p style={{ color: "var(--danger-fg)", fontSize: 13 }}>{error}</p>}
        <button onClick={handleCreate} disabled={isPending || !companyName || !adminEmail || !adminPassword}>
          Create company
        </button>
      </div>

      <div className="card">
        <h3>Companies</h3>
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
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Users</th>
              <th>Projects</th>
              <th>Created</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredCompanies.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c._count.users}</td>
                <td>{c._count.projects}</td>
                <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                <td>
                  <span className={`badge ${c.suspendedAt ? "badge-status-failed" : "badge-status-success"}`}>
                    {c.suspendedAt ? "suspended" : "active"}
                  </span>
                </td>
                <td>
                  <div className="toolbar" style={{ margin: 0 }}>
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
            ))}
            {filteredCompanies.length === 0 && (
              <tr><td colSpan={6} className="muted">
                {companies.length === 0 ? "No companies yet." : "No companies match these filters."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
