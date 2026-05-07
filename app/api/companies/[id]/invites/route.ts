import { NextResponse } from "next/server";

import { generateInviteToken, inviteUrl } from "@/lib/invites";
import { createClient } from "@/lib/supabase/server";
import type { CompanyRole } from "@/types";

export const runtime = "nodejs";

const ROLES: readonly CompanyRole[] = ["owner", "admin", "member"];
const DEFAULT_EXPIRY_DAYS = 7;

interface CreateInviteBody {
  email?: string;
  role?: CompanyRole;
  expiresInDays?: number;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: companyId } = await params;

  let body: CreateInviteBody;
  try {
    body = (await request.json()) as CreateInviteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid `email` required" }, { status: 400 });
  }

  const role = body.role ?? "member";
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid `role`" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expiresInDays = body.expiresInDays ?? DEFAULT_EXPIRY_DAYS;
  const expiresAt = new Date(
    Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { token, tokenHash } = generateInviteToken();

  const { data, error } = await supabase
    .from("company_invites")
    .insert({
      company_id: companyId,
      email,
      role,
      token_hash: tokenHash,
      invited_by: user.id,
      expires_at: expiresAt,
    })
    .select("id, company_id, email, role, expires_at, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  const origin = new URL(request.url).origin;
  const acceptUrl = inviteUrl(origin, token);

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[invite] company=${companyId} email=${email} role=${role} url=${acceptUrl}`,
    );
  }

  return NextResponse.json({ invite: data, token, acceptUrl }, { status: 201 });
}
