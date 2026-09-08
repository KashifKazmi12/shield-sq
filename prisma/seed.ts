import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Minimal bootstrap: just the platform super admin. It creates no company,
// no project, no dummy data — the super admin logs in, creates a real
// company from /companies, and that company's admin takes it from there
// via the onboarding wizard. For a richer demo dataset (sample company +
// realistic Trivy/Falco data) instead, run `npx tsx prisma/seed-demo.ts`.
async function main() {
  const superAdminEmail = "superadmin@sqsecure.local";
  await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {},
    create: {
      email: superAdminEmail,
      passwordHash: await bcrypt.hash("changeme123", 10),
      role: "super_admin",
      companyId: null,
      onboardedAt: new Date(),
    },
  });

  console.log("Seed complete.");
  console.log(`Super admin login: ${superAdminEmail} / changeme123`);
  console.log("Log in, change that password, then create your first company from /companies.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
