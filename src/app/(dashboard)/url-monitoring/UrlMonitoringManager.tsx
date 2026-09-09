"use client";

import { useState, useTransition, useEffect } from "react";
import { DataTable } from "@/components/DataTable";
import { Drawer } from "@/components/Drawer";
import { createSite, rescanSite, discoverEndpoints, deleteSite, listScanResults } from "./actions";

type Site = {
  id: string;
  url: string;
  domain: string;
  createdAt: Date | string;
  _count: { endpoints: number };
  scans: { statusCode: number | null; latencyMs: number | null; scannedAt: Date | string }[];
};

type ScanResult = {
  id: string;
  statusCode: number | null;
  latencyMs: number | null;
  scannedAt: Date | string;
  endpoint: { url: string; path: string } | null;
};

function fmt(d: Date | string) {
  return new Date(d).toLocaleString();
}

function healthBadge(statusCode: number | null) {
  if (statusCode == null) return <span className="badge badge-status-failed">unreachable</span>;
  if (statusCode >= 200 && statusCode < 400) return <span className="badge badge-status-success">{statusCode}</span>;
  return <span className="badge badge-status-failed">{statusCode}</span>;
}

export function UrlMonitoringManager({ sites }: { sites: Site[] }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowNotice, setRowNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [drawerSite, setDrawerSite] = useState<Site | null>(null);
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [scansLoading, setScansLoading] = useState(false);
  const [scansPage, setScansPage] = useState(1);
  const [scansTotal, setScansTotal] = useState(0);
  const [scansPageSize, setScansPageSize] = useState(1);

  useEffect(() => {
    if (!drawerSite) return;
    setScansLoading(true);
    listScanResults({ siteId: drawerSite.id, page: scansPage })
      .then((res) => {
        setScans(res.rows);
        setScansTotal(res.total);
        setScansPageSize(res.pageSize);
      })
      .finally(() => setScansLoading(false));
  }, [drawerSite, scansPage]);

  function handleCreate() {
    setError(null);
    setWarning(null);
    startTransition(async () => {
      try {
        const result = await createSite({ url });
        if (result.warning) setWarning(result.warning);
        setUrl("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function handleRescan(id: string) {
    setRowError(null);
    setRowNotice(null);
    startTransition(async () => {
      try {
        await rescanSite(id);
      } catch (err) {
        setRowError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function handleDiscover(id: string) {
    setRowError(null);
    setRowNotice(null);
    startTransition(async () => {
      try {
        const result = await discoverEndpoints(id);
        setRowNotice(
          result.newEndpointsFound > 0
            ? `Found ${result.newEndpointsFound} new endpoint${result.newEndpointsFound === 1 ? "" : "s"} (${result.linksFound} total on the page).`
            : `No new endpoints — still ${result.linksFound} on the page.`
        );
      } catch (err) {
        setRowError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function handleDelete(id: string) {
    setRowError(null);
    startTransition(async () => {
      try {
        await deleteSite(id);
        if (drawerSite?.id === id) setDrawerSite(null);
      } catch (err) {
        setRowError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div>
      <div className="card section">
        <h3>Monitor a new site</h3>
        <div className="toolbar">
          <input
            type="text"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <button onClick={handleCreate} disabled={isPending || !url.trim()}>
            Add site
          </button>
        </div>
        {error && <p style={{ color: "var(--danger-fg)", fontSize: 13 }}>{error}</p>}
        {warning && (
          <p style={{ color: "var(--attention-fg)", fontSize: 13 }}>
            Site added, but the initial scan had an issue: {warning}
          </p>
        )}
      </div>

      <div className="card">
        <h3>Monitored sites</h3>
        {rowError && <p style={{ color: "var(--danger-fg)", fontSize: 13 }}>{rowError}</p>}
        {rowNotice && <p className="muted" style={{ fontSize: 13 }}>{rowNotice}</p>}

        <DataTable
          columns={[
            { id: "domain", header: "Site", mobileFullWidth: true },
            { id: "status", header: "Last status" },
            { id: "latency", header: "Latency" },
            { id: "endpoints", header: "Endpoints" },
            { id: "actions", header: "", mobileFullWidth: true, mobileHideLabel: true },
          ]}
          onRowClick={(key) => {
            setScansPage(1);
            setDrawerSite(sites.find((s) => s.id === key) ?? null);
          }}
          rows={sites.map((site) => {
            const lastScan = site.scans[0];
            return {
              key: site.id,
              cells: [
                site.domain,
                lastScan ? healthBadge(lastScan.statusCode) : <span className="muted">—</span>,
                lastScan?.latencyMs != null ? `${Math.round(lastScan.latencyMs)}ms` : "—",
                site._count.endpoints,
                <div key="actions" className="toolbar" style={{ margin: 0 }} onClick={(e) => e.stopPropagation()}>
                  <button className="secondary" onClick={() => handleRescan(site.id)} disabled={isPending}>
                    Rescan
                  </button>
                  <button className="secondary" onClick={() => handleDiscover(site.id)} disabled={isPending}>
                    Discover endpoints
                  </button>
                  <button className="danger" onClick={() => handleDelete(site.id)} disabled={isPending}>
                    Delete
                  </button>
                </div>,
              ],
            };
          })}
          emptyMessage="No sites monitored yet."
        />
      </div>

      <Drawer
        open={!!drawerSite}
        title={drawerSite ? `Scan history — ${drawerSite.domain}` : "Scan history"}
        onClose={() => setDrawerSite(null)}
      >
        {scansLoading && <p className="muted">Loading…</p>}
        {!scansLoading && scans.length === 0 && <p className="muted">No scans yet.</p>}
        {!scansLoading && (
          <DataTable
            columns={[
              { id: "target", header: "Target", mobileFullWidth: true },
              { id: "status", header: "Status" },
              { id: "latency", header: "Latency" },
              { id: "scannedAt", header: "Scanned" },
            ]}
            rows={scans.map((s) => ({
              key: s.id,
              cells: [
                s.endpoint ? s.endpoint.path : "(site root)",
                healthBadge(s.statusCode),
                s.latencyMs != null ? `${Math.round(s.latencyMs)}ms` : "—",
                fmt(s.scannedAt),
              ],
            }))}
            emptyMessage="No scans yet."
          />
        )}
        {!scansLoading && scansTotal > scansPageSize && (
          <div className="toolbar" style={{ justifyContent: "space-between" }}>
            <button
              type="button"
              className="secondary"
              disabled={scansPage <= 1}
              onClick={() => setScansPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="muted" style={{ fontSize: 13 }}>
              Page {scansPage} of {Math.ceil(scansTotal / scansPageSize)}
            </span>
            <button
              type="button"
              className="secondary"
              disabled={scansPage >= Math.ceil(scansTotal / scansPageSize)}
              onClick={() => setScansPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </Drawer>
    </div>
  );
}
