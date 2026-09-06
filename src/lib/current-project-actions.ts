"use server";

import { cookies } from "next/headers";
import { CURRENT_PROJECT_COOKIE } from "./current-project";

/** Persist the selected project so navigations without `?project=` can restore it. */
export async function setCurrentProjectCookie(projectId: string) {
  const jar = await cookies();
  jar.set(CURRENT_PROJECT_COOKIE, projectId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
  });
}
