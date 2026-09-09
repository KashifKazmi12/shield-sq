import type { ReactNode } from "react";
import { requireCompanyFeatureSession } from "@/lib/session";

export default async function UrlMonitoringLayout({ children }: { children: ReactNode }) {
  await requireCompanyFeatureSession("url_monitoring");
  return <>{children}</>;
}
