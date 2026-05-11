import { CompanyTeamShell } from "@/components/teams/CompanyTeamShell";
import { createClient } from "@/lib/supabase/server";
import type { CompanyMemberWithEmail, CompanyRole } from "@/types";

interface Props {
  companyId: string;
  organizationLabel?: string;
}

function isPrivilegedRole(role: string | undefined): boolean {
  return role === "owner" || role === "admin";
}

export async function CompanyTeamSection({
  companyId,
  organizationLabel,
}: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: myRow } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!myRow?.role) return null;

  const isPrivileged = isPrivilegedRole(myRow.role);

  const { data: rawMembers, error: membersError } = await supabase.rpc(
    "list_company_members_with_email",
    { p_company_id: companyId },
  );

  type RpcMemberRow = {
    user_id: string;
    email: string;
    role: string;
    created_at: string;
  };
  const members: CompanyMemberWithEmail[] = (rawMembers ?? []).map(
    (row: RpcMemberRow) => ({
      user_id: row.user_id,
      email: row.email,
      role: row.role as CompanyRole,
      created_at: row.created_at,
    }),
  );

  let pendingInvites: {
    id: string;
    email: string;
    role: CompanyRole;
    expires_at: string;
    created_at: string;
  }[] = [];

  if (isPrivileged) {
    const { data: invites } = await supabase
      .from("company_invites")
      .select("id, email, role, expires_at, created_at")
      .eq("company_id", companyId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    pendingInvites = (invites ?? []).map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role as CompanyRole,
      expires_at: r.expires_at,
      created_at: r.created_at,
    }));
  }

  return (
    <CompanyTeamShell
      companyId={companyId}
      currentUserId={user.id}
      isPrivileged={isPrivileged}
      members={members}
      pendingInvites={pendingInvites}
      membersError={membersError?.message ?? null}
      organizationLabel={organizationLabel}
    />
  );
}
