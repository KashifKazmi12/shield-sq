import type { LeakProvider } from "@prisma/client";

// Client-safe provider metadata — no Prisma Client/crypto imports, so this is
// the one thing both the server-side registry (leak-providers.ts) and the
// client-side Configuration UI can import directly. Adding a provider means
// adding it here too (alongside the Prisma enum value, a migration, and a
// call function + registry entry in leak-providers.ts).
export const PROVIDER_IDS: LeakProvider[] = ["checkleaked", "leakcheck"];

export const PROVIDER_LABELS: Record<LeakProvider, string> = {
  checkleaked: "CheckLeaked",
  leakcheck: "LeakCheck",
};
