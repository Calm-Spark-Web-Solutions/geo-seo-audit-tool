import type { SupabaseClient } from "@supabase/supabase-js";

import {
  FREE_PLAN_LIMITS,
  TRIAL_PLAN_LIMITS,
  UNLIMITED_PLAN_LIMITS,
  resolvePlanLimits,
  type PlanLimits,
} from "@/lib/billing/plan-limits";
import { userAllowedPaidProductFeatures } from "@/lib/billing/subscription-access";
import { isStripeConfigured } from "@/lib/stripe/server";

export interface BillingContext {
  /** True when Stripe enforcement is bypassed (dev/staging or escape hatch). */
  unlimited: boolean;
  /** Plan slug from `subscriptions.plan` (null when no row). */
  plan: string | null;
  /** Effective limits after applying the row-level `plan_limits` override. */
  limits: PlanLimits;
  /** All company ids the user is a member of. */
  companyIds: string[];
}

/**
 * Resolve the effective billing context for the signed-in user:
 *   - All company memberships
 *   - Subscription plan + plan_limits override
 *   - Whether enforcement is on at all
 *
 * Returns `unlimited: true` whenever Stripe is unconfigured, the bypass
 * env var is set, or the subscription is not in an allowed status — the
 * existing helpers used by `startAudit` are mirrored here so every billing
 * gate uses the same decision.
 */
export async function loadBillingContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<BillingContext> {
  const stripeOn = isStripeConfigured();

  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("status, plan, plan_limits")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: memberships } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId);
  const companyIds = [
    ...new Set((memberships ?? []).map((m) => m.company_id as string)),
  ];

  const bypass =
    !stripeOn ||
    process.env.ALLOW_AUDITS_WITHOUT_SUBSCRIPTION === "1" ||
    !userAllowedPaidProductFeatures(stripeOn, subRow);

  if (bypass) {
    return {
      unlimited: true,
      plan: subRow?.plan ?? null,
      limits: UNLIMITED_PLAN_LIMITS,
      companyIds,
    };
  }

  if (subRow?.status === "trialing") {
    return {
      unlimited: false,
      plan: subRow.plan ?? null,
      limits: TRIAL_PLAN_LIMITS,
      companyIds,
    };
  }

  const plan = subRow?.plan ?? null;
  const limits = subRow
    ? resolvePlanLimits(plan, subRow.plan_limits ?? null)
    : FREE_PLAN_LIMITS;

  return {
    unlimited: false,
    plan,
    limits,
    companyIds,
  };
}

/**
 * Resolve the community ids the user can see within their orgs. Centralized
 * so page-quota / community-quota / audit-quota all stay in lockstep.
 */
export async function loadCommunityIdsForUser(
  supabase: SupabaseClient,
  companyIds: string[],
): Promise<string[]> {
  if (companyIds.length === 0) return [];
  const { data } = await supabase
    .from("communities")
    .select("id")
    .in("company_id", companyIds);
  return (data ?? []).map((c) => c.id as string);
}

/** Community ids for a single organization. */
export async function loadCommunityIdsForCompany(
  supabase: SupabaseClient,
  companyId: string,
): Promise<string[]> {
  return loadCommunityIdsForUser(supabase, [companyId]);
}

/** Returns true when the user belongs to the company. */
export async function userIsMemberOfCompany(
  supabase: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();
  return Boolean(data);
}
