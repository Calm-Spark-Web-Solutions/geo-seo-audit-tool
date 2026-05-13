import type { SupabaseClient } from "@supabase/supabase-js";

import { isStripeConfigured } from "@/lib/stripe/server";
import {
  effectiveMonthlyScans,
  resolvePlanLimits,
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

/**
 * Returns how many audits the user's organizations started in the **UTC**
 * calendar month vs the cap from their subscription plan. When Stripe is off
 * or subscription bypass is on, returns `unlimited` for display (enforcement
 * in startAudit matches).
 */
export async function getAuditQuotaSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<AuditQuotaSnapshot> {
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

  const planLimits = resolvePlanLimits(
    subRow?.plan ?? null,
    subRow?.plan_limits ?? null,
  );
  // Scale the per-community audit-start budget by the customer's purchased
  // community quantity (stored on `plan_limits.communities` by the webhook).
  // Caller fits into "unlimited" when the per-community budget is `null`.
  const limit = effectiveMonthlyScans(planLimits, planLimits.communities);
  if (limit === null || limit <= 0) {
    return { kind: "unlimited" };
  }
  const { start, end, periodLabel } = utcMonthWindow();

  const { data: memberships } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId);

  const companyIds = [...new Set((memberships ?? []).map((m) => m.company_id))];
  if (companyIds.length === 0) {
    return {
      kind: "limited",
      used: 0,
      limit,
      remaining: limit,
      periodLabel,
    };
  }

  const { data: communities } = await supabase
    .from("communities")
    .select("id")
    .in("company_id", companyIds);

  const communityIds = (communities ?? []).map((c) => c.id as string);
  if (communityIds.length === 0) {
    return {
      kind: "limited",
      used: 0,
      limit,
      remaining: limit,
      periodLabel,
    };
  }

  const { count, error } = await supabase
    .from("audits")
    .select("id", { count: "exact", head: true })
    .in("community_id", communityIds)
    .gte("created_at", start)
    .lt("created_at", end);

  if (error) {
    console.warn("[audit-quota] count failed:", error.message);
    return {
      kind: "limited",
      used: 0,
      limit,
      remaining: limit,
      periodLabel,
    };
  }

  const used = count ?? 0;
  const remaining = Math.max(0, limit - used);

  return {
    kind: "limited",
    used,
    limit,
    remaining,
    periodLabel,
  };
}

/** Block new audit when quota exhausted (Stripe + paid path only). */
export function quotaAllowsNewAudit(snapshot: AuditQuotaSnapshot): boolean {
  if (snapshot.kind === "unlimited") return true;
  return snapshot.remaining > 0;
}
