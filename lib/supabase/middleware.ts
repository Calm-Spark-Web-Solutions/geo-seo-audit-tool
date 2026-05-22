import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/companies",
  "/communities",
  "/visibility-scans",
  "/settings",
  "/usage",
  "/integrations",
  "/onboarding",
  "/api/visibility-scans",
  "/api/companies",
] as const;

const AUTH_PATHS = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
]);

function isProtected(path: string): boolean {
  // Server-to-server runner endpoints authenticate themselves via shared-secret
  // headers in their own route handlers (x-audit-runner-token for /run, plus
  // Authorization: Bearer $CRON_SECRET for cron-tick), so the cookie-based
  // middleware must let them through — otherwise the redirect-to-/login here
  // would intercept the runner kick before its own auth check runs and the
  // job would stay wedged in `queued` forever.
  if (path === "/api/visibility-scans/cron-tick") return false;
  if (/^\/api\/visibility-scans\/[^/]+\/run$/.test(path)) return false;

  // /api/invites/accept must remain reachable so authenticated invitees can
  // post to it; any other /api/invites endpoint requires auth.
  if (path === "/api/invites/accept") return true;
  if (path.startsWith("/api/invites")) return true;
  return PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const protectedRoute = isProtected(path);
  const authRoute = AUTH_PATHS.has(path);

  if (!user && protectedRoute) {
    const dest = new URL("/login", request.url);
    return NextResponse.redirect(dest);
  }

  if (user && authRoute) {
    // /reset-password is reached as a signed-in user (Supabase grants a
    // temporary recovery session); always let them through to update their
    // password. /forgot-password and the invite-return /login flows are
    // also allowed because they're explicit user choices, not stale links.
    if (path === "/reset-password" || path === "/forgot-password") {
      return supabaseResponse;
    }
    const nextParam = request.nextUrl.searchParams.get("next");
    if (nextParam && nextParam.startsWith("/invite/")) {
      return supabaseResponse;
    }
    const dest = new URL("/dashboard", request.url);
    return NextResponse.redirect(dest);
  }

  return supabaseResponse;
}
