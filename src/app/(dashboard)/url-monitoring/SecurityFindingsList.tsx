"use client";

import { ScrollLoadingList } from "@/components/ScrollLoadingList";
import { SeverityBadge } from "@/components/SeverityBadge";
import { loadMoreSiteFindings } from "./actions";

const SITE_FINDING_TYPE_LABELS: Record<string, string> = {
  ssl_cert: "SSL/TLS certificate",
  caa_record: "CAA record",
  subdomain: "Subdomain discovery",
};

export type SiteFindingRow = {
  id: string;
  domain: string;
  type: string;
  severity: string;
  title: string;
  detectedAt: string; // ISO
};

export function SecurityFindingsList({
  initialRows,
  initialCursor,
  filters,
}: {
  initialRows: SiteFindingRow[];
  initialCursor: string | null;
  filters: { type?: string; severity?: string };
}) {
  return (
    <ScrollLoadingList
      initialRows={initialRows}
      initialCursor={initialCursor}
      loadMore={(cursor) => loadMoreSiteFindings({ cursor, ...filters })}
      columns={[
        { id: "domain", header: "Site", mobileFullWidth: true },
        { id: "check", header: "Check" },
        { id: "severity", header: "Severity" },
        { id: "title", header: "Finding" },
        { id: "detectedAt", header: "Detected" },
      ]}
      toRow={(f) => ({
        key: f.id,
        cells: [
          f.domain,
          SITE_FINDING_TYPE_LABELS[f.type] ?? f.type,
          <SeverityBadge key="sev" severity={f.severity} />,
          f.title,
          new Date(f.detectedAt).toLocaleString(),
        ],
      })}
      emptyMessage="No open SSL/CAA/subdomain findings. Checks run on Rescan/Discover endpoints."
    />
  );
}
