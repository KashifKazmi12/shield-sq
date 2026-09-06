import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OnboardingWizard } from "./OnboardingWizard";

// headers() became async as of Next 15+ (a "dynamic API" — reading request
// data during render can no longer be synchronous under PPR/streaming).
async function resolveBaseUrl() {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${proto}://${host}`;
}

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (session.user?.role === "super_admin") {
    // The platform operator manages companies, not a single tenant's setup.
    redirect("/companies");
  }
  if (session.user?.role !== "admin") {
    // Viewers have nothing to configure — send them straight to the dashboard.
    redirect("/vulnerabilities");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboardedAt: true, company: { select: { suspendedAt: true } } },
  });
  if (user?.company?.suspendedAt) redirect("/login?suspended=1");
  if (user?.onboardedAt) redirect("/vulnerabilities");

  return <OnboardingWizard baseUrl={await resolveBaseUrl()} />;
}
