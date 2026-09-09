"use client";

import { useState, useTransition, useEffect } from "react";
import { DataTable } from "@/components/DataTable";
import { Drawer } from "@/components/Drawer";
import { SeverityBadge } from "@/components/SeverityBadge";
import type { LeakIdentifierType } from "@prisma/client";
import { createIdentity, syncIdentity, deleteIdentity, listFindings, revealFindingPassword } from "./actions";

type Identity = {
  id: string;
  identifierType: LeakIdentifierType;
  identifierValue: string;
  status: string;
  lastCheckedAt: Date | string | null;
  lastError: string | null;
  createdAt: Date | string;
  _count: { findings: number };
};

type Finding = {
  id: string;
  source: string;
  breachName: string;
  severity: string;
  leakedAt: Date | string | null;
  createdAt: Date | string;
  hasPassword: boolean;
};

function fmt(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <ellipse cx="8" cy="8" rx="6.3" ry="4" />
      {open ? <circle cx="8" cy="8" r="1.8" fill="currentColor" stroke="none" /> : <line x1="2" y1="13" x2="14" y2="3" />}
    </svg>
  );
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  active: "badge-status-success",
  pending: "badge-status-warning",
  error: "badge-status-failed",
  disabled: "",
};

function MonitorStatusBadge({ status }: { status: string }) {
  return <span className={`badge ${STATUS_BADGE_CLASS[status] ?? ""}`}>{status}</span>;
}

export function LeakCheckingManager({ identities }: { identities: Identity[] }) {
  const [identifierType, setIdentifierType] = useState<LeakIdentifierType>("email");
  const [identifierValue, setIdentifierValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [drawerIdentity, setDrawerIdentity] = useState<Identity | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [findingsPage, setFindingsPage] = useState(1);
  const [findingsTotal, setFindingsTotal] = useState(0);
  const [findingsPageSize, setFindingsPageSize] = useState(1);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);

  useEffect(() => {
    if (!drawerIdentity) return;
    setFindingsLoading(true);
    setRevealed({});
    listFindings({ identityId: drawerIdentity.id, page: findingsPage })
      .then((res) => {
        setFindings(res.rows);
        setFindingsTotal(res.total);
        setFindingsPageSize(res.pageSize);
      })
      .finally(() => setFindingsLoading(false));
  }, [drawerIdentity, findingsPage]);

  function handleToggleReveal(findingId: string) {
    if (revealed[findingId] !== undefined) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[findingId];
        return next;
      });
      return;
    }
    setRevealError(null);
    setRevealingId(findingId);
    startTransition(async () => {
      try {
        const result = await revealFindingPassword(findingId);
        setRevealed((prev) => ({ ...prev, [findingId]: result.password }));
      } catch (err) {
        setRevealError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setRevealingId(null);
      }
    });
  }

  function handleCreate() {
    setError(null);
    setWarning(null);
    startTransition(async () => {
      try {
        const result = await createIdentity({ identifierType, identifierValue });
        if (result.warning) setWarning(result.warning);
        setIdentifierValue("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function handleSync(id: string) {
    setRowError(null);
    startTransition(async () => {
      try {
        await syncIdentity(id);
      } catch (err) {
        setRowError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function handleDelete(id: string) {
    setRowError(null);
    startTransition(async () => {
      try {
        await deleteIdentity(id);
        if (drawerIdentity?.id === id) setDrawerIdentity(null);
      } catch (err) {
        setRowError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div>
      <div className="card section">
        <h3>Monitor a new identity</h3>
        <div className="toolbar" style={{ flexWrap: "wrap" }}>
          <select value={identifierType} onChange={(e) => setIdentifierType(e.target.value as LeakIdentifierType)}>
            <option value="email">Email</option>
            <option value="username">Username</option>
          </select>
          <input
            type="text"
            placeholder={identifierType === "email" ? "security@example.com" : "username"}
            value={identifierValue}
            onChange={(e) => setIdentifierValue(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <button onClick={handleCreate} disabled={isPending || !identifierValue.trim()}>
            Add identity
          </button>
        </div>
        {error && <p style={{ color: "var(--danger-fg)", fontSize: 13 }}>{error}</p>}
        {warning && (
          <p style={{ color: "var(--attention-fg)", fontSize: 13 }}>
            Identity added, but the initial check had an issue: {warning}
          </p>
        )}
      </div>

      <div className="card">
        <h3>Monitored identities</h3>
        {rowError && <p style={{ color: "var(--danger-fg)", fontSize: 13 }}>{rowError}</p>}

        <DataTable
          columns={[
            { id: "value", header: "Identity", mobileFullWidth: true },
            { id: "status", header: "Status" },
            { id: "findings", header: "Findings" },
            { id: "lastChecked", header: "Last checked" },
            { id: "actions", header: "", mobileFullWidth: true, mobileHideLabel: true },
          ]}
          onRowClick={(key) => {
            setFindingsPage(1);
            setDrawerIdentity(identities.find((i) => i.id === key) ?? null);
          }}
          rows={identities.map((identity) => ({
            key: identity.id,
            cells: [
              `${identity.identifierValue} (${identity.identifierType})`,
              <MonitorStatusBadge key="status" status={identity.status} />,
              identity._count.findings,
              fmt(identity.lastCheckedAt),
              <div key="actions" className="toolbar" style={{ margin: 0 }} onClick={(e) => e.stopPropagation()}>
                <button className="secondary" onClick={() => handleSync(identity.id)} disabled={isPending}>
                  Sync
                </button>
                <button className="danger" onClick={() => handleDelete(identity.id)} disabled={isPending}>
                  Delete
                </button>
              </div>,
            ],
          }))}
          emptyMessage="No identities monitored yet."
        />
      </div>

      <Drawer
        open={!!drawerIdentity}
        title={drawerIdentity ? `Findings — ${drawerIdentity.identifierValue}` : "Findings"}
        onClose={() => setDrawerIdentity(null)}
      >
        {findingsLoading && <p className="muted">Loading…</p>}
        {!findingsLoading && findings.length === 0 && <p className="muted">No findings for this identity.</p>}
        {revealError && <p style={{ color: "var(--danger-fg)", fontSize: 13 }}>{revealError}</p>}
        {!findingsLoading &&
          findings.map((f) => (
            <div key={f.id} className="card section">
              <div className="toolbar" style={{ justifyContent: "space-between" }}>
                <strong>{f.breachName}</strong>
                <SeverityBadge severity={f.severity} />
              </div>
              <p className="muted" style={{ fontSize: 13, margin: "4px 0" }}>
                {f.leakedAt && <>Leaked: {fmt(f.leakedAt)} · </>}Found: {fmt(f.createdAt)}
              </p>
              {f.hasPassword && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <span className="muted" style={{ fontSize: 13 }}>Password:</span>
                  <code>{revealed[f.id] ?? "••••••••"}</code>
                  <button
                    type="button"
                    className="secondary"
                    style={{ padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}
                    disabled={revealingId === f.id}
                    onClick={() => handleToggleReveal(f.id)}
                    title={revealed[f.id] !== undefined ? "Hide password" : "Show password"}
                  >
                    <EyeIcon open={revealed[f.id] !== undefined} />
                  </button>
                </div>
              )}
            </div>
          ))}
        {!findingsLoading && findingsTotal > findingsPageSize && (
          <div className="toolbar" style={{ justifyContent: "space-between" }}>
            <button
              type="button"
              className="secondary"
              disabled={findingsPage <= 1}
              onClick={() => setFindingsPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="muted" style={{ fontSize: 13 }}>
              Page {findingsPage} of {Math.ceil(findingsTotal / findingsPageSize)}
            </span>
            <button
              type="button"
              className="secondary"
              disabled={findingsPage >= Math.ceil(findingsTotal / findingsPageSize)}
              onClick={() => setFindingsPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </Drawer>
    </div>
  );
}
