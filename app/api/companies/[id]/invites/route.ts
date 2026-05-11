import { NextResponse } from "next/server";

import {
  createCompanyInviteRow,
  INVITE_RATE_LIMIT_MAX,
  INVITE_RATE_LIMIT_WINDOW_S,
  normalizeInviteEmail,
  normalizeInviteRole,
} from "@/lib/company-invite";
import { consumeRateLimit } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";
import type { CompanyRole } from "@/types";

export const runtime = "nodejs";

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

  const email = normalizeInviteEmail(body.email);
  if (!email) {
    return NextResponse.json({ error: "Valid `email` required" }, { status: 400 });
  }

  const role = normalizeInviteRole(body.role);
  if (!role) {
    return NextResponse.json(
      { error: "Invalid `role` — use `member` or `admin`." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await consumeRateLimit(
    supabase,
    `invite:create:${user.id}`,
    INVITE_RATE_LIMIT_MAX,
    INVITE_RATE_LIMIT_WINDOW_S,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many invites sent recently. Try again in an hour." },
      { status: 429 },
    );
  }

  const origin = new URL(request.url).origin;
  const outcome = await createCompanyInviteRow(supabase, {
    companyId,
    email,
    role,
    invitedByUserId: user.id,
    requestOrigin: origin,
    expiresInDays: body.expiresInDays,
  });

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.message }, { status: 403 });
  }

  const { invite: data, acceptUrl } = outcome;

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[invite] company=${companyId} email=${email} role=${role} url=${acceptUrl}`,
    );
  }

  // Intentionally do NOT return the raw `token` — only the full acceptUrl
  // (which already contains it) and the public-safe invite metadata. The
  // inviter shares the acceptUrl; the token is otherwise stored as a hash.
  return NextResponse.json({ invite: data, acceptUrl }, { status: 201 });
}
