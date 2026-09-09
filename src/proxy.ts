import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

// Protects everything except the ingest API, NextAuth routes, login page, and
// Next.js internals/static assets — ingest uses its own bearer-token auth.
// Also splits the app in two by role: super_admin only ever sees platform-
// management routes (/companies, /configuration), everyone else is confined
// to the company-scoped dashboard and can't reach those.
//
// Named `proxy` (file: proxy.ts) per Next 16 — this is the same request
// interceptor that used to be `middleware.ts`/`export function middleware`;
// Next deprecated that name in favor of `proxy.ts`/`export function proxy`,
// same behavior and matcher config.
const SUPER_ADMIN_ROUTES = ["/companies", "/configuration"];

export async function proxy(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isSuperAdmin = token.role === "super_admin";
  const isSuperAdminRoute = SUPER_ADMIN_ROUTES.some((route) => pathname.startsWith(route));

  if (isSuperAdmin && !isSuperAdminRoute) {
    return NextResponse.redirect(new URL("/companies", req.url));
  }
  if (!isSuperAdmin && isSuperAdminRoute) {
    return NextResponse.redirect(new URL("/vulnerabilities", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/ingest|api/auth|login|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
