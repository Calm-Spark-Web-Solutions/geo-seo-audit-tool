"use server";

import { cookies } from "next/headers";

const COOKIE_NAME = "rl_active_org";
const MAX_AGE = 60 * 60 * 24 * 60; // 60 days

/** Persist the active org so the dashboard can read it server-side. */
export async function setActiveOrgCookie(companyId: string): Promise<void> {
  (await cookies()).set(COOKIE_NAME, companyId, {
    path: "/",
    maxAge: MAX_AGE,
    httpOnly: false,
    sameSite: "lax",
  });
}

/** Read the persisted active org id (may be null if never set). */
export async function getActiveOrgCookie(): Promise<string | null> {
  return (await cookies()).get(COOKIE_NAME)?.value ?? null;
}
