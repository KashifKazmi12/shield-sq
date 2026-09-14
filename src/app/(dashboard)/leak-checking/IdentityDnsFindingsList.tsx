"use client";

import { ScrollLoadingList } from "@/components/ScrollLoadingList";
import { SeverityBadge } from "@/components/SeverityBadge";
import { loadMoreIdentityDnsFindings } from "./actions";

const DNS_FINDING_TYPE_LABELS: Record<string, string> = {
  spf_missing: "SPF",
  dmarc_missing: "DMARC",
  dkim_missing: "DKIM",
};

export type IdentityDnsFindingRow = {
  id: string;
  identifierValue: string;
  type: string;
  severity: string;
  title: string;
  detectedAt: string; // ISO
};

export function IdentityDnsFindingsList({
  initialRows,
  initialCursor,
}: {
  initialRows: IdentityDnsFindingRow[];
  initialCursor: string | null;
}) {
  return (
    <ScrollLoadingList
      initialRows={initialRows}
      initialCursor={initialCursor}
      loadMore={(cursor) => loadMoreIdentityDnsFindings({ cursor })}
      columns={[
        { id: "identity", header: "Identity", mobileFullWidth: true },
        { id: "check", header: "Check" },
        { id: "severity", header: "Severity" },
        { id: "title", header: "Finding" },
        { id: "detectedAt", header: "Detected" },
      ]}
      toRow={(f) => ({
        key: f.id,
        cells: [
          f.identifierValue,
          DNS_FINDING_TYPE_LABELS[f.type] ?? f.type,
          <SeverityBadge key="sev" severity={f.severity} />,
          f.title,
          new Date(f.detectedAt).toLocaleString(),
        ],
      })}
      emptyMessage="No open SPF/DMARC/DKIM findings. Checks run on Sync / create-identity actions."
    />
  );
}
