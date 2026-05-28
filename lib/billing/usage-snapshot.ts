/**
 * Aggregate usage snapshot for the Usage page. Returns caps and actual usage
 * so the UI can render meters without each component re-querying.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuditQuotaSnapshot } from "@/lib/billing/audit-quota";
import {
  loadBillingContext,
  loadCommunityIdsForCompany,
  userIsMemberOfCompany,
  type BillingContext,
} from "@/lib/billing/billing-context";
import {
  communityQuotaFromContext,
  type CommunityQuotaSnapshot,
} from "@/lib/billing/community-quota";
import { effectiveMonthlyNewPagesCap } from "@/lib/billing/plan-limits";
import type { AuditQuotaSnapshot } from "@/lib/billing/audit-quota";

export interface CommunityRosterUsage {
  communityId: string;
  communityName: string;
  rosterUsed: number;
  rosterCap: number | null;
  newAddedThisMonth: number;
  newMonthlyCap: number | null;
}

export interface BillingUsageSnapshot {
  context: BillingContext;
  audits: AuditQuotaSnapshot;
  community: CommunityQuotaSnapshot;
  perCommunity: CommunityRosterUsage[];
  organizationId: string;
  organizationName: string;
}

export type LoadBillingUsageSnapshotOptions = {
  companyId: string;
  companyName: string;
};

function utcMonthStartIso(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)).toISOString();
}

export async function loadBillingUsageSnapshot(
  supabase: SupabaseClient,
  userId: string,
  options: LoadBillingUsageSnapshotOptions,
): Promise<BillingUsageSnapshot | null> {
  const { companyId, companyName } = options;

  const isMember = await userIsMemberOfCompany(supabase, userId, companyId);
  if (!isMember) return null;

  const context = await loadBillingContext(supabase, userId);
  const audits = await getAuditQuotaSnapshot(supabase, userId, { companyId });

  const communityIds = await loadCommunityIdsForCompany(supabase, companyId);

  const { data: communityRows } = communityIds.length
    ? await supabase
        .from("communities")
        .select("id, name")
        .in("id", communityIds)
        .order("name", { ascending: true })
    : { data: [] as { id: string; name: string }[] };

  const community = communityQuotaFromContext(
    context,
    communityIds.length,
  );

  const monthStart = utcMonthStartIso();
  const perCommunity: CommunityRosterUsage[] = [];

  for (const row of communityRows ?? []) {
    const [{ count: rosterUsed }, { count: newAddedThisMonth }] =
      await Promise.all([
        supabase
          .from("community_page_roster")
          .select("id", { count: "exact", head: true })
          .eq("community_id", row.id),
        supabase
          .from("community_page_roster")
          .select("id", { count: "exact", head: true })
          .eq("community_id", row.id)
          .gte("first_seen_at", monthStart),
      ]);

    perCommunity.push({
      communityId: row.id,
      communityName: row.name,
      rosterUsed: rosterUsed ?? 0,
      rosterCap: context.unlimited ? null : context.limits.pagesPerCommunity,
      newAddedThisMonth: newAddedThisMonth ?? 0,
      newMonthlyCap: context.unlimited
        ? null
        : effectiveMonthlyNewPagesCap(context.limits),
    });
  }

  return {
    context,
    audits,
    community,
    perCommunity,
    organizationId: companyId,
    organizationName: companyName,
  };
}
