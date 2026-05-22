import type { SupabaseClient } from "@supabase/supabase-js";

import { loadCommunityIdsForCompany } from "@/lib/billing/billing-context";
import { isStripeConfigured } from "@/lib/stripe/server";
import {
  TRIAL_PLAN_LIMITS,
  effectiveMonthlyScans,
  resolvePlanLimits,
  trialWindowFromPlanLimits,
} from "@/lib/billing/plan-limits";
import { userAllowedPaidProductFeatures } from "@/lib/billing/subscription-access";

export type AuditQuotaSnapshot =
  | {
      kind: "unlimited";
    }
  | {
      kind: "limited";
      used: number;
      limit: number;
      remaining: number;
      /** Month label for the UTC window used in usage queries, e.g. "May 2026 (UTC)". */
      periodLabel: string;
    };

export type AuditQuotaOptions = {
  /** When set, `used` counts only audits in this organization's communities. */
  companyId?: string;
};

/**
 * Calendar month in UTC — same window for `periodLabel` and the audits count query.
 */
function utcMonthWindow(now = new Date()): {
  start: string;
  end: string;
  periodLabel: string;
} {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
  const periodLabel = `${new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m, 15, 12, 0, 0, 0)))} (UTC)`;

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    periodLabel,
  };
}

async function resolveCommunityIdsForQuota(
  supabase: SupabaseClient,
  userId: string,
  companyId?: string,
): Promise<string[]> {
  if (companyId) {
    return loadCommunityIdsForCompany(supabase, companyId);
  }

  const { data: memberships } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId);

  const companyIds = [...new Set((memberships ?? []).map((m) => m.company_id as string))];
  if (companyIds.length === 0) return [];

  const { data: communities } = await supabase
    .from("communities")
    .select("id")
    .in("company_id", companyIds);

  return (communities ?? []).map((c) => c.id as string);
}

async function countManualQuotaAudits(
  supabase: SupabaseClient,
  communityIds: string[],
  start: string,
  end: string,
): Promise<number> {
  if (communityIds.length === 0) return 0;

  const { count, error } = await supabase
    .from("audits")
    .select("id", { count: "exact", head: true })
    .in("community_id", communityIds)
    .eq("consumes_manual_quota", true)
    .gte("created_at", start)
    .lt("created_at", end);

  if (error) {
    console.warn("[audit-quota] count failed:", error.message);
    return 0;
  }

  return count ?? 0;
}

/**
 * Returns how many audits started in the billing window vs the account cap.
 * When `companyId` is set, `used` is scoped to that org; `limit` stays account-wide.
 */
export async function getAuditQuotaSnapshot(
  supabase: SupabaseClient,
  userId: string,
  options?: AuditQuotaOptions,
): Promise<AuditQuotaSnapshot> {
  const companyId = options?.companyId;
  const stripeOn = isStripeConfigured();

  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("status, plan, plan_limits")
    .eq("user_id", userId)
    .maybeSingle();

  if (
    !stripeOn ||
    process.env.ALLOW_AUDITS_WITHOUT_SUBSCRIPTION === "1" ||
    !userAllowedPaidProductFeatures(stripeOn, subRow)
  ) {
    return { kind: "unlimited" };
  }

  if (subRow?.status === "trialing") {
    const limit =
      effectiveMonthlyScans(TRIAL_PLAN_LIMITS, TRIAL_PLAN_LIMITS.communities) ??
      3;
    const tw = trialWindowFromPlanLimits(subRow.plan_limits);
    const { start, end, periodLabel } = tw
      ? { start: tw.start, end: tw.end, periodLabel: "Trial period (UTC)" }
      : utcMonthWindow();

    const communityIds = await resolveCommunityIdsForQuota(
      supabase,
      userId,
      companyId,
    );
    const used = await countManualQuotaAudits(
      supabase,
      communityIds,
      start,
      end,
    );

    return {
      kind: "limited",
      used,
      limit,
      remaining: Math.max(0, limit - used),
      periodLabel,
    };
  }

  const planLimits = resolvePlanLimits(
    subRow?.plan ?? null,
    subRow?.plan_limits ?? null,
  );
  const limit = effectiveMonthlyScans(planLimits, planLimits.communities);
  if (limit === null || limit <= 0) {
    return { kind: "unlimited" };
  }

  const { start, end, periodLabel } = utcMonthWindow();
  const communityIds = await resolveCommunityIdsForQuota(
    supabase,
    userId,
    companyId,
  );
  const used = await countManualQuotaAudits(
    supabase,
    communityIds,
    start,
    end,
  );

  return {
    kind: "limited",
    used,
    limit,
    remaining: Math.max(0, limit - used),
    periodLabel,
  };
}

/** Block new audit when quota exhausted (Stripe + paid path only). */
export function quotaAllowsNewAudit(snapshot: AuditQuotaSnapshot): boolean {
  if (snapshot.kind === "unlimited") return true;
  return snapshot.remaining > 0;
}
