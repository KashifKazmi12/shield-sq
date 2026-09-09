import type { ReactNode } from "react";
import { requireCompanyFeatureSession } from "@/lib/session";

export default async function LeakCheckingLayout({ children }: { children: ReactNode }) {
  await requireCompanyFeatureSession("leak_checking");
  return <>{children}</>;
}
