import { redirect } from "next/navigation";

/** Old Overview route — send people to the Vulnerabilities dashboard. */
export default async function OverviewRedirect({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  redirect(project ? `/vulnerabilities?project=${encodeURIComponent(project)}` : "/vulnerabilities");
}
