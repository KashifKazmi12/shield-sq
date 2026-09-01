import { SEVERITIES, type Severity } from "./constants";

// Lower index = more severe. Returns true if `severity` is at least as
// severe as `threshold` (e.g. "critical" meets a "high" threshold).
export function severityRank(severity: string): number {
  const idx = SEVERITIES.indexOf(severity as Severity);
  return idx === -1 ? SEVERITIES.length : idx;
}

export function severityMeetsThreshold(severity: string, threshold: string): boolean {
  const sevIdx = SEVERITIES.indexOf(severity as Severity);
  const thresholdIdx = SEVERITIES.indexOf(threshold as Severity);
  if (sevIdx === -1 || thresholdIdx === -1) return false;
  return sevIdx <= thresholdIdx;
}

// Normalizes tool-specific severity vocab to our shared scale.
// Trivy: UNKNOWN/LOW/MEDIUM/HIGH/CRITICAL. Falco priority: Emergency..Debug.
export function normalizeTrivySeverity(raw: string | undefined): Severity {
  switch ((raw ?? "").toUpperCase()) {
    case "CRITICAL":
      return "critical";
    case "HIGH":
      return "high";
    case "MEDIUM":
      return "medium";
    case "LOW":
      return "low";
    default:
      return "info";
  }
}

export function normalizeFalcoPriority(raw: string | undefined): Severity {
  switch ((raw ?? "").toLowerCase()) {
    case "emergency":
    case "alert":
    case "critical":
      return "critical";
    case "error":
      return "high";
    case "warning":
      return "medium";
    case "notice":
      return "low";
    default:
      return "info";
  }
}
