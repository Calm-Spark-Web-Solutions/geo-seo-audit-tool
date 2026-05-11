import { getAuditQuotaSnapshot, type AuditQuotaSnapshot } from "@/lib/billing/audit-quota";
import { createClient } from "@/lib/supabase/server";

export type DashboardAccount = {
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
};

export async function loadDashboardAccount(): Promise<{
  account: DashboardAccount | null;
  quota: AuditQuotaSnapshot;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { account: null, quota: { kind: "unlimited" } };
  }

  const meta = (user.user_metadata ?? {}) as {
    full_name?: string;
    name?: string;
    avatar_url?: string;
  };

  const quota = await getAuditQuotaSnapshot(supabase, user.id);

  return {
    account: {
      email: user.email,
      fullName: meta.full_name ?? meta.name ?? null,
      avatarUrl: meta.avatar_url ?? null,
    },
    quota,
  };
}
