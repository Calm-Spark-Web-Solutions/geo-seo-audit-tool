/**
 * Concrete billing limits per plan slug.
 *
 * The pricing model is **per-community**: customers pick a plan tier (which
 * sets the per-community page roster, new-page-per-month allowance, and a
 * per-community audit-start budget) and a community count. Stripe carries
 * the community count as the subscription item's `quantity`, which the
 * webhook mirrors into `subscriptions.plan_limits.communities`. This lets
 * pricing scale linearly without a Stripe SKU per (tier × seat-count).
 *
 * Two-layer model (see `022_billing_page_roster.sql`):
 *
 *   1. `PLAN_LIMITS_BY_SLUG` — per-community defaults for each Stripe plan
 *      key. Edited here so everything stays compile-time obvious.
 *   2. `subscriptions.plan_limits` (jsonb) — per-account override applied
 *      on top of the slug defaults. The webhook writes `{ communities: N }`
 *      from the Stripe quantity; Partner / Enterprise accounts can also
 *      override `pagesPerCommunity` / `newPagesPerCommunityMonth` /
 *      `monthlyScans` by hand.
 *
 * The runtime helpers always prefer the row override when present and fall
 * back to the slug defaults, so a `null` row column means "use the plan
 * defaults below".
 *
 * Units used here:
 *
 *   - `monthlyScans`     audit-starts per UTC month, per-community on a
 *                        paid plan (scaled by `effectiveMonthlyScans` for
 *                        the audit-quota check). `null` = unlimited.
 *   - `communities`      hard cap on `communities` rows the org may keep.
 *                        Defaults below are `1` per Stripe quantity unit;
 *                        webhook overrides with the actual quantity.
 *   - `pagesPerCommunity` hard cap on URLs in `community_page_roster` per
 *                        community (rescans of already-tracked URLs are free).
 *   - `newPagesPerCommunityMonth` cap on URLs newly added to the roster
 *                        in a given UTC month per community.
 *
 * `null` means "no limit / unlimited" for that knob.
 */

import type { CheckoutTierPriceKey } from "./price-map";

export interface PlanLimits {
  monthlyScans: number | null;
  communities: number | null;
  pagesPerCommunity: number | null;
  newPagesPerCommunityMonth: number | null;
  /**
   * Per-community bonus to `newPagesPerCommunityMonth` from purchased
   * Page Packs (Stripe add-on `pages_pack_{monthly,yearly}`). `null` means
   * "no override", `0` means "explicitly zero". `effectiveMonthlyNewPagesCap`
   * adds this to the base cap.
   */
  newPagesPackBonusPerMonth: number | null;
  /**
   * Per-community bonus manual audit-starts per UTC month from Run Packs
   * (`runs_pack_{monthly,yearly}`). Same merge rules as page-pack bonus.
   */
  monthlyScansPackBonusPerMonth: number | null;
}

/**
 * When Stripe is unconfigured / `ALLOW_AUDITS_WITHOUT_SUBSCRIPTION=1` we
 * return this so UI meters still render "unlimited" cleanly.
 */
export const UNLIMITED_PLAN_LIMITS: PlanLimits = {
  monthlyScans: null,
  communities: null,
  pagesPerCommunity: null,
  newPagesPerCommunityMonth: null,
  newPagesPackBonusPerMonth: null,
  monthlyScansPackBonusPerMonth: null,
};

/**
 * Fallback used when no subscription row exists (free / no plan).
 * Generous on rescans, modest on new-page additions, single community —
 * mirrors the "Residence" tier copy in lib/billing/plans.ts.
 */
export const FREE_PLAN_LIMITS: PlanLimits = {
  monthlyScans: 5,
  communities: 1,
  pagesPerCommunity: 25,
  newPagesPerCommunityMonth: 10,
  newPagesPackBonusPerMonth: 0,
  monthlyScansPackBonusPerMonth: 0,
};

/**
 * Stripe `trialing` — no card required during Checkout trial; caps enforced
 * in-app until the subscription becomes `active`.
 */
export const TRIAL_PLAN_LIMITS: PlanLimits = {
  monthlyScans: 3,
  communities: 1,
  pagesPerCommunity: 10,
  newPagesPerCommunityMonth: 10,
  newPagesPackBonusPerMonth: 0,
  monthlyScansPackBonusPerMonth: 0,
};

/**
 * Per-community defaults. `communities: 1` is the single-seat baseline;
 * Stripe quantity → webhook → `subscriptions.plan_limits.communities`
 * overrides this to the actual purchased count. `monthlyScans` is the
 * per-community audit-start budget; the audit-quota check multiplies it
 * by the active community count via `effectiveMonthlyScans` below.
 */
export const PLAN_LIMITS_BY_SLUG: Record<CheckoutTierPriceKey, PlanLimits> = {
  residence_monthly: {
    monthlyScans: 10,
    communities: 1,
    pagesPerCommunity: 50,
    newPagesPerCommunityMonth: 20,
    newPagesPackBonusPerMonth: 0,
    monthlyScansPackBonusPerMonth: 0,
  },
  residence_yearly: {
    monthlyScans: 10,
    communities: 1,
    pagesPerCommunity: 50,
    newPagesPerCommunityMonth: 20,
    newPagesPackBonusPerMonth: 0,
    monthlyScansPackBonusPerMonth: 0,
  },
  community_monthly: {
    monthlyScans: 20,
    communities: 1,
    pagesPerCommunity: 150,
    newPagesPerCommunityMonth: 60,
    newPagesPackBonusPerMonth: 0,
    monthlyScansPackBonusPerMonth: 0,
  },
  community_yearly: {
    monthlyScans: 20,
    communities: 1,
    pagesPerCommunity: 150,
    newPagesPerCommunityMonth: 60,
    newPagesPackBonusPerMonth: 0,
    monthlyScansPackBonusPerMonth: 0,
  },
  portfolio_monthly: {
    monthlyScans: 40,
    communities: 1,
    pagesPerCommunity: 500,
    newPagesPerCommunityMonth: 200,
    newPagesPackBonusPerMonth: 0,
    monthlyScansPackBonusPerMonth: 0,
  },
  portfolio_yearly: {
    monthlyScans: 40,
    communities: 1,
    pagesPerCommunity: 500,
    newPagesPerCommunityMonth: 200,
    newPagesPackBonusPerMonth: 0,
    monthlyScansPackBonusPerMonth: 0,
  },
  partner_monthly: {
    // Partner / Enterprise: invoiced, generous defaults; expected to be
    // overridden via `subscriptions.plan_limits` for true enterprise SLAs.
    monthlyScans: 200,
    communities: 100,
    pagesPerCommunity: 1000,
    newPagesPerCommunityMonth: 500,
    newPagesPackBonusPerMonth: 0,
    monthlyScansPackBonusPerMonth: 0,
  },
};

/**
 * Page Pack add-on configuration. Stripe Prices `pages_pack_monthly` /
 * `pages_pack_yearly` are billed per (community × packs) units, so total
 * monthly add-on cost = `unitMonthlyUsd × communities × packs`.
 */
export const PACK_PRICING = {
  /** New-pages-per-month per community granted by one pack unit. */
  newPagesPerUnit: 20,
  unitMonthlyUsd: 5,
  /** ~17% off paying monthly × 12 (aligned with tier annual discount). */
  unitYearlyUsd: 50,
} as const;

/**
 * Run Pack add-on: +10 manual audit-starts per community per month per unit.
 * Billed per (community × packs) like page packs.
 */
export const RUNS_PACK_PRICING = {
  monthlyScansPerUnit: 10,
  unitMonthlyUsd: 10,
  unitYearlyUsd: 100,
} as const;

/**
 * Max page/run packs **per community** by tier (`null` = unlimited).
 * Basic: 3 each; Plus: 5 each; Pro & Partner: unlimited.
 */
export function maxAddonPacksPerCommunity(
  tierPriceKey: CheckoutTierPriceKey,
): number | null {
  if (tierPriceKey.startsWith("portfolio")) return null;
  if (tierPriceKey.startsWith("partner")) return null;
  if (tierPriceKey.startsWith("community")) return 5;
  if (tierPriceKey.startsWith("residence")) return 3;
  return 3;
}

/**
 * Per-community monthly USD price for each tier. Displayed by the plan
 * builder; total = `unitPrice × communities`. Yearly is a 17% discount
 * (~2 months free).
 */
export interface TierPricing {
  monthlyUsd: number;
  yearlyUsd: number;
  /** Internal short name used in copy. */
  label: string;
  /** Short pitch shown under the title in the builder. */
  tagline: string;
}

export const TIER_PRICING: Record<
  "residence" | "community" | "portfolio",
  TierPricing
> = {
  residence: {
    monthlyUsd: 29,
    yearlyUsd: 290,
    label: "Basic",
    tagline: "Perfect for single communities getting started with SEO & GEO",
  },
  community: {
    monthlyUsd: 59,
    yearlyUsd: 590,
    label: "Plus",
    tagline: "For regional operators managing several communities",
  },
  portfolio: {
    monthlyUsd: 99,
    yearlyUsd: 990,
    label: "Pro",
    tagline: "For large operators and content-heavy multi-brand communities",
  },
};

export const COMMUNITY_QUANTITY_HARD_MIN = 1;
/** Self-serve checkout cap for community quantity on the plan builder. */
export const COMMUNITY_QUANTITY_HARD_MAX = 100;

/**
 * Volume discount tiers on the **tier line** (Basic/Plus/Pro × communities).
 * Stripe Prices should use **volume** tiered billing with matching per-unit
 * amounts — see `stripeVolumeTierRows` and `docs/stripe-dashboard-setup.md`.
 */
export const VOLUME_DISCOUNT_TIERS = [
  { minCommunities: 5, percentOff: 5 },
  { minCommunities: 10, percentOff: 10 },
  { minCommunities: 20, percentOff: 15 },
  { minCommunities: 50, percentOff: 20 },
] as const;

export type VolumeDiscountTier = (typeof VOLUME_DISCOUNT_TIERS)[number];

/** Whole-number percent off list (0, 5, 10, 15, or 20) for a community count. */
export function volumeDiscountPercent(communityCount: number): number {
  const n = Math.floor(communityCount);
  let percent = 0;
  for (const tier of VOLUME_DISCOUNT_TIERS) {
    if (n >= tier.minCommunities) percent = tier.percentOff;
  }
  return percent;
}

/** Fraction off list subtotal (0–0.2). */
export function volumeDiscountFraction(communityCount: number): number {
  return volumeDiscountPercent(communityCount) / 100;
}

/** Index of the active tier in `VOLUME_DISCOUNT_TIERS`, or -1 when below 5 communities. */
export function activeVolumeDiscountTierIndex(communityCount: number): number {
  const n = Math.floor(communityCount);
  let idx = -1;
  for (let i = 0; i < VOLUME_DISCOUNT_TIERS.length; i++) {
    if (n >= VOLUME_DISCOUNT_TIERS[i].minCommunities) idx = i;
  }
  return idx;
}

/** Per-community unit price after volume discount (2 decimal USD). */
export function volumeDiscountedUnitUsd(
  listUnitUsd: number,
  communityCount: number,
): number {
  const frac = volumeDiscountFraction(communityCount);
  return Math.round(listUnitUsd * (1 - frac) * 100) / 100;
}

/**
 * Stripe **volume** tier rows (`up_to` + unit amount) for a list per-community price.
 * Use when configuring tier Prices in the Dashboard.
 */
export function stripeVolumeTierRows(listUnitUsd: number): Array<{
  upTo: number | null;
  unitUsd: number;
  percentOff: number;
}> {
  const rows: Array<{ upTo: number | null; unitUsd: number; percentOff: number }> =
    [{ upTo: 4, unitUsd: listUnitUsd, percentOff: 0 }];

  const upToStops = [9, 19, 49, null] as const;
  for (let i = 0; i < VOLUME_DISCOUNT_TIERS.length; i++) {
    const tier = VOLUME_DISCOUNT_TIERS[i];
    const unitUsd =
      Math.round(listUnitUsd * (1 - tier.percentOff / 100) * 100) / 100;
    rows.push({
      upTo: upToStops[i],
      unitUsd,
      percentOff: tier.percentOff,
    });
  }
  return rows;
}

/** Whole-dollar list subtotal before volume discount (tier unit × communities). */
export function monthlyListSubtotal(
  unitMonthlyUsd: number,
  communityCount: number,
): number {
  return unitMonthlyUsd * Math.max(COMMUNITY_QUANTITY_HARD_MIN, communityCount);
}

/** Estimated post-volume-discount tier subtotal (integer USD; monthly or yearly unit). */
export function volumeDiscountedSubtotal(
  unitUsd: number,
  communityCount: number,
): number {
  const list = monthlyListSubtotal(unitUsd, communityCount);
  const frac = volumeDiscountFraction(communityCount);
  return Math.round(list * (1 - frac));
}

/** @deprecated Prefer `volumeDiscountedSubtotal` — same behavior. */
export function monthlyVolumeDiscountedSubtotal(
  unitMonthlyUsd: number,
  communityCount: number,
): number {
  return volumeDiscountedSubtotal(unitMonthlyUsd, communityCount);
}

/**
 * Total audit-starts budget for the org in a UTC month, given the
 * per-community default and the effective community count from the
 * subscription override.
 */
export function effectiveMonthlyScans(
  limits: PlanLimits,
  communityCount: number | null,
): number | null {
  if (limits.monthlyScans === null) return null;
  const packBonus =
    limits.monthlyScansPackBonusPerMonth === null
      ? 0
      : Math.max(0, limits.monthlyScansPackBonusPerMonth);
  const perCommunity = Math.max(0, limits.monthlyScans) + packBonus;
  if (communityCount === null) return perCommunity;
  const safeCount = Math.max(1, Math.floor(communityCount));
  return perCommunity * safeCount;
}

/**
 * Effective new-pages-per-month cap per community = base tier allowance
 * plus any purchased Page Pack bonus. Either being `null` (unlimited)
 * makes the whole cap unlimited; otherwise both are summed.
 */
export function effectiveMonthlyNewPagesCap(
  limits: PlanLimits,
): number | null {
  if (limits.newPagesPerCommunityMonth === null) return null;
  if (limits.newPagesPackBonusPerMonth === null) return null;
  const base = Math.max(0, limits.newPagesPerCommunityMonth);
  const bonus = Math.max(0, limits.newPagesPackBonusPerMonth);
  return base + bonus;
}

/**
 * Merge a per-subscription override jsonb on top of the plan defaults.
 * Unknown fields are ignored; non-numeric values are dropped (treated as
 * "use default"). `null` in an override means "set this knob to unlimited".
 */
export function applyPlanLimitsOverride(
  base: PlanLimits,
  override: unknown,
): PlanLimits {
  if (!override || typeof override !== "object") return base;
  const o = override as Record<string, unknown>;
  const next: PlanLimits = { ...base };

  const keys: (keyof PlanLimits)[] = [
    "monthlyScans",
    "communities",
    "pagesPerCommunity",
    "newPagesPerCommunityMonth",
    "newPagesPackBonusPerMonth",
    "monthlyScansPackBonusPerMonth",
  ];
  for (const k of keys) {
    if (!(k in o)) continue;
    const v = o[k];
    if (v === null) {
      next[k] = null;
    } else if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      next[k] = Math.floor(v);
    }
  }
  return next;
}

/**
 * Resolve effective plan limits from a `subscriptions` row shape.
 * `plan` is the slug stored in `subscriptions.plan`; `planLimits` is the
 * optional jsonb override.
 */
export function resolvePlanLimits(
  plan: string | null | undefined,
  planLimits: unknown | null | undefined,
): PlanLimits {
  const base = plan && plan in PLAN_LIMITS_BY_SLUG
    ? PLAN_LIMITS_BY_SLUG[plan as CheckoutTierPriceKey]
    : FREE_PLAN_LIMITS;
  return applyPlanLimitsOverride(base, planLimits ?? null);
}

/** Trial window bounds stored in `subscriptions.plan_limits` by the webhook. */
export function trialWindowFromPlanLimits(
  planLimits: unknown | null | undefined,
): { start: string; end: string } | null {
  if (!planLimits || typeof planLimits !== "object") return null;
  const o = planLimits as Record<string, unknown>;
  const s = o.billing_trial_start;
  const e = o.billing_trial_end;
  if (typeof s === "string" && typeof e === "string") return { start: s, end: e };
  return null;
}

/**
 * Format limits as a single short sentence used on the plan builder
 * card copy (tracked pages · manual runs · free auto rescan line).
 * Community count is dropped because the builder displays it as a separate
 * input, not a per-card cap.
 */
export function formatPlanLimitsShort(limits: PlanLimits): string {
  const parts: string[] = [];
  parts.push(
    limits.pagesPerCommunity === null
      ? "Unlimited pages tracked"
      : `${limits.pagesPerCommunity.toLocaleString()} pages tracked`,
  );
  parts.push(
    limits.monthlyScans === null
      ? "Unlimited manual audit runs/mo"
      : `${limits.monthlyScans.toLocaleString()} manual audit runs/mo`,
  );
  parts.push("1 free auto rescan/mo");
  return parts.join(" · ");
}
