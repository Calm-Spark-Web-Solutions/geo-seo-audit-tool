import { NextResponse } from "next/server";

import { GOOGLE_OAUTH_SCOPES } from "@/lib/integrations/google/config";
import {
  oauthErrorReturnPath,
  oauthSuccessReturnPath,
} from "@/lib/integrations/google/oauth-return";
import {
  exchangeGoogleCode,
  fetchGoogleAccountEmail,
} from "@/lib/integrations/google/oauth";
import { encryptSecret, verifyOAuthState } from "@/lib/security/token-crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function redirectToPath(request: Request, path: string): NextResponse {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin;
  return NextResponse.redirect(`${base}${path}`);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const error = searchParams.get("error");

  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");
  if (!stateRaw) {
    return redirectToPath(
      request,
      "/integrations/google?google=error&reason=invalid_state",
    );
  }

  const state = verifyOAuthState<{
    companyId: string;
    userId: string;
    returnTo?: string | null;
    exp: number;
  }>(stateRaw);

  const companyId = state?.companyId ?? "";
  const returnTo = state?.returnTo ?? null;

  if (error) {
    return redirectToPath(
      request,
      oauthErrorReturnPath(returnTo, companyId, error),
    );
  }

  if (!code || !state?.companyId || !state?.userId) {
    return redirectToPath(
      request,
      oauthErrorReturnPath(returnTo, companyId, "missing_code"),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== state.userId) {
    return redirectToPath(
      request,
      oauthErrorReturnPath(returnTo, companyId, "session"),
    );
  }

  try {
    const tokens = await exchangeGoogleCode(code);
    if (!tokens.refresh_token) {
      return redirectToPath(
        request,
        oauthErrorReturnPath(returnTo, companyId, "no_refresh_token"),
      );
    }

    const email = await fetchGoogleAccountEmail(tokens.access_token);
    const encrypted = encryptSecret(tokens.refresh_token);

    const { error: upsertErr } = await supabase
      .from("company_google_connections")
      .upsert(
        {
          company_id: state.companyId,
          refresh_token_encrypted: encrypted,
          scopes: [...GOOGLE_OAUTH_SCOPES],
          connected_by: user.id,
          connected_at: new Date().toISOString(),
          google_account_email: email,
          last_error: null,
        },
        { onConflict: "company_id" },
      );

    if (upsertErr) {
      return redirectToPath(
        request,
        oauthErrorReturnPath(returnTo, companyId, upsertErr.message),
      );
    }

    return redirectToPath(
      request,
      oauthSuccessReturnPath(returnTo, state.companyId),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "oauth_failed";
    return redirectToPath(
      request,
      oauthErrorReturnPath(returnTo, companyId, msg),
    );
  }
}
