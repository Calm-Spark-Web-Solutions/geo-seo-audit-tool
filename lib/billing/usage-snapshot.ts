/**
 * Aggregate usage snapshot for the Settings → Billing page. Returns the
 * caps and the actual usage so the UI can render meters without each
 * component re-querying.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuditQuotaSnapshot, type AuditQuotaSnapshot } from "@/lib/billing/audit-quota";
import {
  loadBillingContext,
  loadCommunityIdsForUser,
  type BillingContext,
} from "@/lib/billing/billing-context";
import {
  communityQuotaFromContext,
  type CommunityQuotaSnapshot,
} from "@/lib/billing/community-quota";
import { effectiveMonthlyNewPagesCap } from "@/lib/billing/plan-limits";

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
}

function utcMonthStartIso(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)).toISOString();
}

export async function loadBillingUsageSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<BillingUsageSnapshot> {
  const context = await loadBillingContext(supabase, userId);
  const audits = await getAuditQuotaSnapshot(supabase, userId);

  const communityIds = await loadCommunityIdsForUser(
    supabase,
    context.companyIds,
  );

  const { data: communityRows } = communityIds.length
    ? await supabase
        .from("communities")
        .select("id, name")
        .in("id", communityIds)
    : { data: [] as { id: string; name: string }[] };

  const community = communityQuotaFromContext(context, communityIds.length);

  const monthStart = utcMonthStartIso();
  const perCommunity: CommunityRosterUsage[] = [];

  // Sequential to keep query budget bounded for portfolios with 100+
  // communities. The Settings page is server-rendered with caching, and
  // most accounts will have <= a few rows here.
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
      // Effective cap = base + Page Pack bonus, so the meter reflects what
      // the customer actually purchased.
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
  };
}
