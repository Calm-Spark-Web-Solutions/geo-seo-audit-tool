import { NextResponse } from "next/server";

import {
  createCompanyInviteRow,
  type CreatedCompanyInvite,
  DEFAULT_INVITE_EXPIRY_DAYS,
  INVITE_RATE_LIMIT_MAX,
  INVITE_RATE_LIMIT_WINDOW_S,
  normalizeInviteEmail,
  normalizeInviteRole,
} from "@/lib/company-invite";
import { consumeRateLimit } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";
import type { CompanyRole } from "@/types";

export const runtime = "nodejs";

interface BatchInviteBody {
  email?: string;
  role?: CompanyRole;
  company_ids?: string[];
  /** When true, invite to every company where the user is owner or admin. */
  all?: boolean;
  expiresInDays?: number;
}

export async function POST(request: Request) {
  let body: BatchInviteBody;
  try {
    body = (await request.json()) as BatchInviteBody;
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

  let companyIds: string[];
  if (body.all === true) {
    const { data: rows, error: memErr } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"]);
    if (memErr) {
      return NextResponse.json({ error: memErr.message }, { status: 403 });
    }
    companyIds = [...new Set((rows ?? []).map((r) => r.company_id))];
  } else {
    const raw = body.company_ids;
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json(
        { error: "Provide `company_ids` (non-empty array) or `all: true`." },
        { status: 400 },
      );
    }
    companyIds = [...new Set(raw.filter((id): id is string => typeof id === "string" && id.length > 0))];
    if (companyIds.length === 0) {
      return NextResponse.json(
        { error: "No valid company IDs in `company_ids`." },
        { status: 400 },
      );
    }
  }

  if (companyIds.length === 0) {
    return NextResponse.json(
      { error: "No organizations available — you need owner or admin access on at least one company." },
      { status: 400 },
    );
  }

  const { data: memberships, error: privErr } = await supabase
    .from("company_members")
    .select("company_id, role")
    .eq("user_id", user.id)
    .in("company_id", companyIds)
    .in("role", ["owner", "admin"]);

  if (privErr) {
    return NextResponse.json({ error: privErr.message }, { status: 403 });
  }

  const allowed = new Set((memberships ?? []).map((m) => m.company_id));
  for (const id of companyIds) {
    if (!allowed.has(id)) {
      return NextResponse.json(
        {
          error:
            "You are not an owner or admin for every selected organization. No invites were created.",
        },
        { status: 403 },
      );
    }
  }

  // One rate-limit slot per invite row (same key as single-company POST).
  for (let i = 0; i < companyIds.length; i++) {
    const allowedRl = await consumeRateLimit(
      supabase,
      `invite:create:${user.id}`,
      INVITE_RATE_LIMIT_MAX,
      INVITE_RATE_LIMIT_WINDOW_S,
    );
    if (!allowedRl) {
      return NextResponse.json(
        { error: "Too many invites sent recently. Try again in an hour." },
        { status: 429 },
      );
    }
  }

  const { data: companies, error: coErr } = await supabase
    .from("companies")
    .select("id, name")
    .in("id", companyIds);

  if (coErr) {
    return NextResponse.json({ error: coErr.message }, { status: 403 });
  }

  const nameById = new Map((companies ?? []).map((c) => [c.id, c.name] as const));

  const origin = new URL(request.url).origin;
  const expiresInDays = body.expiresInDays ?? DEFAULT_INVITE_EXPIRY_DAYS;

  const createdInviteIds: string[] = [];
  const results: Array<{
    company_id: string;
    company_name: string;
    invite: CreatedCompanyInvite;
    acceptUrl: string;
  }> = [];

  try {
    for (const companyId of companyIds) {
      const outcome = await createCompanyInviteRow(supabase, {
        companyId,
        email,
        role,
        invitedByUserId: user.id,
        requestOrigin: origin,
        expiresInDays,
      });

      if (!outcome.ok) {
        if (createdInviteIds.length > 0) {
          await supabase.from("company_invites").delete().in("id", createdInviteIds);
        }
        return NextResponse.json({ error: outcome.message }, { status: 403 });
      }

      createdInviteIds.push(outcome.invite.id);
      results.push({
        company_id: companyId,
        company_name: nameById.get(companyId) ?? "Organization",
        invite: outcome.invite,
        acceptUrl: outcome.acceptUrl,
      });

      if (process.env.NODE_ENV !== "production") {
        console.info(
          `[invite:batch] company=${companyId} email=${email} role=${role} url=${outcome.acceptUrl}`,
        );
      }
    }
  } catch (err) {
    if (createdInviteIds.length > 0) {
      await supabase.from("company_invites").delete().in("id", createdInviteIds);
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Batch invite failed unexpectedly.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ results }, { status: 201 });
}
