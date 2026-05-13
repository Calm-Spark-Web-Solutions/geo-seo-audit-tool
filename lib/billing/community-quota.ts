/**
 * Community-bucket quota: enforces the per-plan cap on how many
 * `communities` rows an org may keep active. Used by the community create
 * action before insert and exposed to the Settings → Billing usage card.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadBillingContext,
  loadCommunityIdsForUser,
  type BillingContext,
} from "@/lib/billing/billing-context";

export type CommunityQuotaSnapshot =
  | { kind: "unlimited"; used: number }
  | {
      kind: "limited";
      used: number;
      limit: number;
      remaining: number;
    };

export async function getCommunityQuotaSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<CommunityQuotaSnapshot> {
  const ctx = await loadBillingContext(supabase, userId);
  return communityQuotaFromContext(ctx, await communityCount(supabase, ctx));
}

export function communityQuotaFromContext(
  ctx: BillingContext,
  used: number,
): CommunityQuotaSnapshot {
  if (ctx.unlimited || ctx.limits.communities === null) {
    return { kind: "unlimited", used };
  }
  const limit = ctx.limits.communities;
  const remaining = Math.max(0, limit - used);
  return { kind: "limited", used, limit, remaining };
}

async function communityCount(
  supabase: SupabaseClient,
  ctx: BillingContext,
): Promise<number> {
  if (ctx.companyIds.length === 0) return 0;
  const ids = await loadCommunityIdsForUser(supabase, ctx.companyIds);
  return ids.length;
}

export function communityQuotaAllowsCreate(
  snapshot: CommunityQuotaSnapshot,
): boolean {
  if (snapshot.kind === "unlimited") return true;
  return snapshot.remaining > 0;
}
