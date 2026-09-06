import { redirect } from "next/navigation";

/** Old Trends route — charts now live on each tool dashboard. */
export default async function TrendsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; tool?: string }>;
}) {
  const { project, tool } = await searchParams;
  const base = tool === "falco" ? "/runtime-alerts" : "/vulnerabilities";
  redirect(project ? `${base}?project=${encodeURIComponent(project)}` : base);
}
