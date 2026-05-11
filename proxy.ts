import { type NextRequest } from "next/server";

import { applySecurityHeaders } from "@/lib/security/headers";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 middleware entry (`proxy.ts`). Refreshes Supabase session cookies
 * and applies global security headers (HSTS, CSP report-only, etc.).
 *
 * See: https://nextjs.org/docs/messages/middleware-to-proxy
 */
export default async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
