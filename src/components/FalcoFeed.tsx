"use client";

import { SeverityBadge } from "./SeverityBadge";

type FalcoFinding = {
  id: string;
  title: string;
  description: string | null;
  resource: string | null;
  severity: string;
  ruleName: string | null;
  detectedAt: Date | string;
};

export function FalcoFeed({ findings }: { findings: FalcoFinding[] }) {
  if (findings.length === 0) {
    return <p className="muted">No runtime alerts match these filters.</p>;
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Severity</th>
            <th>Rule</th>
            <th>Host / pod</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => (
            <tr key={f.id}>
              <td>{new Date(f.detectedAt).toLocaleString()}</td>
              <td><SeverityBadge severity={f.severity} /></td>
              <td>{f.ruleName ?? f.title}</td>
              <td>{f.resource ?? "—"}</td>
              <td className="muted">{f.description ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
