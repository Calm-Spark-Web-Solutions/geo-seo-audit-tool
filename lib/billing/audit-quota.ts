import type { SupabaseClient } from "@supabase/supabase-js";

import { isStripeConfigured } from "@/lib/stripe/server";
import { userAllowedPaidProductFeatures } from "@/lib/billing/subscription-access";

/** Monthly audit starts per subscription plan slug (Stripe checkout keys). */
const MONTHLY_SCANS_BY_PLAN: Record<string, number> = {
  residence_monthly: 20,
  residence_yearly: 20,
  community_monthly: 75,
  community_yearly: 75,
  portfolio_monthly: 250,
  portfolio_yearly: 250,
  partner_monthly: 100,
};

const DEFAULT_MONTHLY_SCANS = 50;

export type AuditQuotaSnapshot =
  | {
      kind: "unlimited";
    }
  | {
      kind: "limited";
      used: number;
      limit: number;
      remaining: number;
      /** ISO month label e.g. May 2026 */
      periodLabel: string;
    };

function planMonthlyLimit(plan: string | null): number {
  if (!plan) return DEFAULT_MONTHLY_SCANS;
  return MONTHLY_SCANS_BY_PLAN[plan] ?? DEFAULT_MONTHLY_SCANS;
}

function monthBoundsUtc(now = new Date()): { start: string; end: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

function periodLabel(now = new Date()): string {
  return now.toLocaleString(undefined, { month: "long", year: "numeric" });
}

/**
 * Returns how many audits the user's organizations started this calendar month
 * vs the cap from their subscription plan. When Stripe is off or subscription
 * bypass is on, returns `unlimited` for display (enforcement in startAudit matches).
 */
export async function getAuditQuotaSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<AuditQuotaSnapshot> {
  const stripeOn = isStripeConfigured();

  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("status, plan")
    .eq("user_id", userId)
    .maybeSingle();

  if (
    !stripeOn ||
    process.env.ALLOW_AUDITS_WITHOUT_SUBSCRIPTION === "1" ||
    !userAllowedPaidProductFeatures(stripeOn, subRow)
  ) {
    return { kind: "unlimited" };
  }

  const limit = planMonthlyLimit(subRow?.plan ?? null);
  if (limit <= 0) {
    return { kind: "unlimited" };
  }
  const { start, end } = monthBoundsUtc();

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
      periodLabel: periodLabel(),
    };
  }

  const { data: communities } = await supabase
    .from("communities")
    .select("id")
    .in("company_id", companyIds);

  const communityIds = (communities ?? []).map((c) => c.id);
  if (communityIds.length === 0) {
    return {
      kind: "limited",
      used: 0,
      limit,
      remaining: limit,
      periodLabel: periodLabel(),
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
      periodLabel: periodLabel(),
    };
  }

  const used = count ?? 0;
  const remaining = Math.max(0, limit - used);

  return {
    kind: "limited",
    used,
    limit,
    remaining,
    periodLabel: periodLabel(),
  };
}

/** Block new audit when quota exhausted (Stripe + paid path only). */
export function quotaAllowsNewAudit(snapshot: AuditQuotaSnapshot): boolean {
  if (snapshot.kind === "unlimited") return true;
  return snapshot.remaining > 0;
}
