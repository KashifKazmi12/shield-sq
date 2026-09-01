import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const authOptions: AuthOptions = {
  // 30 days: long enough that "sign in once, stay signed in" holds for a
  // small team checking a dashboard periodically, short enough that a lost/
  // shared device isn't a permanent standing session. Revisit if the
  // security posture needs something tighter (see DECISIONS.md).
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { company: true },
        });
        if (!user) return null;

        // A suspended company's users can't sign in, even with a correct
        // password — this is the enforcement point for "manage companies".
        if (user.company?.suspendedAt) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, role: user.role, companyId: user.companyId };
      },
    }),
    // Room to add an OAuth provider later, e.g.:
    // GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
        token.companyId = (user as { companyId: string | null }).companyId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string | undefined;
        (session.user as { id?: string }).id = token.sub;
        (session.user as { companyId?: string | null }).companyId = token.companyId as string | null | undefined;
      }
      return session;
    },
  },
};
