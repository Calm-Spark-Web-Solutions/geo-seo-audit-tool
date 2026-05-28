import { hashInviteToken } from "@/lib/invites";
import { createServiceClient } from "@/lib/supabase/service";

export type InvitePreview = {
  email: string;
  role: string;
  organizationName: string;
  inviterName: string | null;
  inviterEmail: string | null;
  expiresAt: string;
  acceptedAt: string | null;
};

export type InvitePreviewResult =
  | { ok: true; preview: InvitePreview }
  | { ok: false; reason: "not_found" | "expired" | "accepted" | "service" };

/**
 * Resolve a public invite preview by raw token. Uses the service-role client
 * because the `company_invites` SELECT policy is restricted to org admins;
 * we deliberately expose only non-sensitive preview fields here.
 */
export async function loadInvitePreview(
  rawToken: string,
): Promise<InvitePreviewResult> {
  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch {
    return { ok: false, reason: "service" };
  }

  const tokenHash = hashInviteToken(rawToken);

  const { data: invite, error } = await supabase
    .from("company_invites")
    .select(
      "company_id, email, role, expires_at, accepted_at, invited_by, companies(name)",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !invite) return { ok: false, reason: "not_found" };

  if (invite.accepted_at) return { ok: false, reason: "accepted" };
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const company = Array.isArray(invite.companies)
    ? invite.companies[0]
    : invite.companies;

  let inviterName: string | null = null;
  let inviterEmail: string | null = null;
  if (invite.invited_by) {
    const { data: userRes } = await supabase.auth.admin.getUserById(
      invite.invited_by as string,
    );
    const meta =
      (userRes?.user?.user_metadata as
        | { full_name?: string | null; name?: string | null }
        | undefined) ?? {};
    inviterName = meta.full_name ?? meta.name ?? null;
    inviterEmail = userRes?.user?.email ?? null;
  }

  return {
    ok: true,
    preview: {
      email: invite.email as string,
      role: invite.role as string,
      organizationName: (company?.name as string | undefined) ?? "an organization",
      inviterName,
      inviterEmail,
      expiresAt: invite.expires_at as string,
      acceptedAt: null,
    },
  };
}
