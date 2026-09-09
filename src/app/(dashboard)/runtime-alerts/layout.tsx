import type { ReactNode } from "react";
import { requireCompanyFeatureSession } from "@/lib/session";

export default async function RuntimeAlertsLayout({ children }: { children: ReactNode }) {
  await requireCompanyFeatureSession("runtime_alerts");
  return <>{children}</>;
}
