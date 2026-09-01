"use client";

import { useState } from "react";
import { SeverityBadge } from "./SeverityBadge";

type TrivyFinding = {
  id: string;
  title: string;
  description: string | null;
  resource: string | null;
  severity: string;
  fixedVersion: string | null;
  detectedAt: Date | string;
  scan: {
    repo: string | null;
    branch: string | null;
    commitSha: string | null;
    pipelineId: string | null;
    createdAt: Date | string;
  };
};

export function TrivyFindingsTable({ findings }: { findings: TrivyFinding[] }) {
  const [selected, setSelected] = useState<TrivyFinding | null>(null);

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>CVE</th>
            <th>Severity</th>
            <th>Image / target</th>
            <th>Repo</th>
            <th>Fix available</th>
            <th>Detected</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => (
            <tr key={f.id} onClick={() => setSelected(f)} style={{ cursor: "pointer" }}>
              <td>{f.title}</td>
              <td><SeverityBadge severity={f.severity} /></td>
              <td>{f.resource ?? "—"}</td>
              <td>{f.scan.repo ?? "—"}</td>
              <td>{f.fixedVersion ?? <span className="muted">unfixed</span>}</td>
              <td>{new Date(f.detectedAt).toLocaleString()}</td>
            </tr>
          ))}
          {findings.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">No findings match these filters.</td>
            </tr>
          )}
        </tbody>
      </table>

      {selected && (
        <div className="drawer-backdrop" onClick={() => setSelected(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <h3>{selected.title}</h3>
            <p><SeverityBadge severity={selected.severity} /></p>
            <p>{selected.description ?? "No description provided."}</p>
            <dl>
              <dt className="muted">Target</dt>
              <dd>{selected.resource ?? "—"}</dd>
              <dt className="muted">Fixed version</dt>
              <dd>{selected.fixedVersion ?? "Not yet fixed upstream"}</dd>
              <dt className="muted">Repo</dt>
              <dd>{selected.scan.repo ?? "—"}</dd>
              <dt className="muted">Branch</dt>
              <dd>{selected.scan.branch ?? "—"}</dd>
              <dt className="muted">Commit</dt>
              <dd>{selected.scan.commitSha ?? "—"}</dd>
              <dt className="muted">Pipeline</dt>
              <dd>{selected.scan.pipelineId ?? "—"}</dd>
              <dt className="muted">Detected</dt>
              <dd>{new Date(selected.detectedAt).toLocaleString()}</dd>
            </dl>
            <button className="secondary" onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
