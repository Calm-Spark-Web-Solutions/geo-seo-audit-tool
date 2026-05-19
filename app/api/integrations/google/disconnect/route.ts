import { NextResponse } from "next/server";

import { decryptSecret } from "@/lib/security/token-crypto";
import { revokeGoogleToken } from "@/lib/integrations/google/oauth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { company_id?: string };
  try {
    body = (await request.json()) as { company_id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const companyId = body.company_id?.trim();
  if (!companyId) {
    return NextResponse.json({ error: "company_id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const { data: row } = await supabase
    .from("company_google_connections")
    .select("refresh_token_encrypted")
    .eq("company_id", companyId)
    .maybeSingle();

  if (row?.refresh_token_encrypted) {
    try {
      const token = decryptSecret(row.refresh_token_encrypted as string);
      await revokeGoogleToken(token);
    } catch {
      /* best-effort revoke */
    }
  }

  const { error } = await supabase
    .from("company_google_connections")
    .delete()
    .eq("company_id", companyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
