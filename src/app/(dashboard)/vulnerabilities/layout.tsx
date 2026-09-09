import type { ReactNode } from "react";
import { requireCompanyFeatureSession } from "@/lib/session";

export default async function VulnerabilitiesLayout({ children }: { children: ReactNode }) {
  await requireCompanyFeatureSession("vulnerabilities");
  return <>{children}</>;
}
