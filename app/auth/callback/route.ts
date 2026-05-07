import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

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

  const { count } = await supabase
    .from("company_members")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const dest = (count ?? 0) > 0 ? "/dashboard" : "/onboarding";
  return NextResponse.redirect(new URL(dest, origin));
}
