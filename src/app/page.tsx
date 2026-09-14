import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LandingPage } from "@/components/LandingPage";

export const metadata = {
  title: "SQSecure — Know your risks. Fix what matters first.",
  description:
    "Bring vulnerability scans, runtime alerts, credential leaks, and website checks into one clear dashboard. Built by SecureQuanta.",
};

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/vulnerabilities");
  return <LandingPage />;
}
