import type { SupabaseClient } from "@supabase/supabase-js";

import { generateInviteToken, inviteUrl } from "@/lib/invites";
import type { CompanyRole } from "@/types";

/** Invites cannot grant `owner` (promotion is a separate flow). */
export const INVITE_ROLES: readonly CompanyRole[] = ["member", "admin"];

export const DEFAULT_INVITE_EXPIRY_DAYS = 7;

/** 20 invite slots / hour / user — each single-company invite consumes one slot; batch consumes one per organization. */
export const INVITE_RATE_LIMIT_MAX = 20;
export const INVITE_RATE_LIMIT_WINDOW_S = 60 * 60;

export type CreatedCompanyInvite = {
  id: string;
  company_id: string;
  email: string;
  role: CompanyRole;
  expires_at: string;
  created_at: string;
};

export function normalizeInviteEmail(raw: string | undefined): string | null {
  const email = raw?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function normalizeInviteRole(
  role: CompanyRole | undefined,
): CompanyRole | null {
  const r = role ?? "member";
  if (!INVITE_ROLES.includes(r)) return null;
  return r;
}

/**
 * Insert one `company_invites` row and build the shareable accept URL.
 * Caller is responsible for authz (owner/admin) and rate limiting.
 */
export async function createCompanyInviteRow(
  supabase: SupabaseClient,
  opts: {
    companyId: string;
    email: string;
    role: CompanyRole;
    invitedByUserId: string;
    requestOrigin: string;
    expiresInDays?: number;
  },
): Promise<
  | { ok: true; invite: CreatedCompanyInvite; acceptUrl: string }
  | { ok: false; message: string }
> {
  const expiresInDays = opts.expiresInDays ?? DEFAULT_INVITE_EXPIRY_DAYS;
  const expiresAt = new Date(
    Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { token, tokenHash } = generateInviteToken();

  const { data, error } = await supabase
    .from("company_invites")
    .insert({
      company_id: opts.companyId,
      email: opts.email,
      role: opts.role,
      token_hash: tokenHash,
      invited_by: opts.invitedByUserId,
      expires_at: expiresAt,
    })
    .select("id, company_id, email, role, expires_at, created_at")
    .single();

  if (error || !data) {
    return { ok: false, message: error?.message ?? "Insert failed" };
  }

  const acceptUrl = inviteUrl(opts.requestOrigin, token);
  return {
    ok: true,
    invite: data as CreatedCompanyInvite,
    acceptUrl,
  };
}
