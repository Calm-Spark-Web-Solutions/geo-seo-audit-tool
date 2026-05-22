import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation/redirect";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=callback", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=callback", origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?error=callback", origin));
  }

  // An invite-return `next` always wins so a freshly-confirmed user can
  // accept the invite they were sent (they have 0 memberships yet).
  if (next && next.startsWith("/invite/")) {
    return NextResponse.redirect(new URL(next, origin));
  }

  const { count } = await supabase
    .from("company_members")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count ?? 0) > 0) {
    return NextResponse.redirect(new URL(next ?? "/dashboard", origin));
  }
  return NextResponse.redirect(new URL("/onboarding", origin));
}
