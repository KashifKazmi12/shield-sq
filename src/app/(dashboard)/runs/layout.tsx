import type { ReactNode } from "react";
import { requireCompanyFeatureSession } from "@/lib/session";

// Pipeline Runs lives under the Vulnerabilities sidebar section (Trivy scans).
export default async function RunsLayout({ children }: { children: ReactNode }) {
  await requireCompanyFeatureSession("vulnerabilities");
  return <>{children}</>;
}
