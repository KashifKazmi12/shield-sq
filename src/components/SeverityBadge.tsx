export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`badge badge-${severity}`}>{severity}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-status-${status}`}>{status}</span>;
}

export function FindingStatusBadge({ status }: { status: string }) {
  const label = status === "reopened" ? "reopened" : status === "resolved" ? "resolved" : "opened";
  return <span className={`badge badge-finding-${label}`}>{label}</span>;
}
