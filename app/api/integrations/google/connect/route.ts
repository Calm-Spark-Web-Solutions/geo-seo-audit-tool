import { NextResponse } from "next/server";

import { isGoogleOAuthConfigured } from "@/lib/integrations/google/config";
import { buildGoogleAuthorizeUrl } from "@/lib/integrations/google/oauth";
import { normalizeOAuthReturnTo } from "@/lib/integrations/google/oauth-return";
import { signOAuthState } from "@/lib/security/token-crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isGoogleOAuthConfigured()) {
    return NextResponse.json(
      { error: "Google OAuth is not configured on this server." },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("company_id")?.trim();
  if (!companyId) {
    return NextResponse.json({ error: "company_id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { data: member } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || !["owner", "admin"].includes(member.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const returnTo = normalizeOAuthReturnTo(
    searchParams.get("return_to"),
    companyId,
  );

  const state = signOAuthState({
    companyId,
    userId: user.id,
    returnTo,
    exp: Date.now() + 10 * 60 * 1000,
  });

  return NextResponse.redirect(buildGoogleAuthorizeUrl(state));
}
