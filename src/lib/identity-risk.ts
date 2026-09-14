// Risk scoring / severity tiers (Email Leak Checking enhancement): combines
// email-leak severity, Breached Password Checker hits, and open identity
// DNS gaps (SPF/DMARC/DKIM) into one overall label — own logic, no external
// call, same "compress several signals into one score" idea as Trivy's
// health score in queries.ts.
export type LeakRiskLevel = "low" | "medium" | "high" | "critical";

export function computeLeakRiskLevel(stats: {
  highSeverityInWindow: number;
  passwordsPwnedInWindow: number;
  openDnsFindings: number;
}): LeakRiskLevel {
  // A password that's both leaked here AND independently confirmed
  // compromised elsewhere is the clearest "act now" signal available —
  // ranks above a bare high-severity breach record.
  if (stats.passwordsPwnedInWindow > 0) return "critical";
  if (stats.highSeverityInWindow > 0) return "high";
  if (stats.openDnsFindings > 0) return "medium";
  return "low";
}
