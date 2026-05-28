/**
 * Marketing copy for billing tiers. Limits + per-community prices are
 * sourced from `plan-limits.ts` so the plan builder UI and the enforcement
 * code never drift.
 *
 * Pricing model: each tier is a **per-community subscription**. The buyer
 * picks a tier (Basic/Plus/Pro) and a community count; Stripe carries the
 * count as the subscription item `quantity` and bills `unit_amount × qty`.
 */

import {
  formatPlanLimitsShort,
  PLAN_LIMITS_BY_SLUG,
  TIER_PRICING,
} from "./plan-limits";
import type { CheckoutTierPriceKey } from "./price-map";

export type PublicTierId = "residence" | "community" | "portfolio";

export interface PublicTierCard {
  id: PublicTierId;
  /** Display name on the card title (e.g. "Plus per community"). */
  name: string;
  /** Short marketing tagline. */
  tagline: string;
  /** One-line limits summary derived from `plan-limits.ts`. */
  limitsNote: string;
  bullets: string[];
  monthlyKey: CheckoutTierPriceKey;
  yearlyKey: CheckoutTierPriceKey;
  /** Per-community unit price in whole USD/mo. */
  monthlyUnitUsd: number;
  /** Per-community unit price in whole USD/yr. */
  yearlyUnitUsd: number;
}

function tierBullets(extras: string[]): string[] {
  return [
    "Rescans of already-tracked pages are always free · 1 free auto rescan/mo",
    ...extras,
  ];
}

/** Three public tiers shown as plan-builder picker cards. */
export const PUBLIC_TIERS: PublicTierCard[] = [
  {
    id: "residence",
    name: `${TIER_PRICING.residence.label} per community`,
    tagline: TIER_PRICING.residence.tagline,
    limitsNote: formatPlanLimitsShort(PLAN_LIMITS_BY_SLUG.residence_monthly),
    bullets: tierBullets([
      "Full SEO + GEO audits with AI commentary",
      "PDF export and audit history",
      "CrUX, PSI, and manual expert checklist",
    ]),
    monthlyKey: "residence_monthly",
    yearlyKey: "residence_yearly",
    monthlyUnitUsd: TIER_PRICING.residence.monthlyUsd,
    yearlyUnitUsd: TIER_PRICING.residence.yearlyUsd,
  },
  {
    id: "community",
    name: `${TIER_PRICING.community.label} per community`,
    tagline: TIER_PRICING.community.tagline,
    limitsNote: formatPlanLimitsShort(PLAN_LIMITS_BY_SLUG.community_monthly),
    bullets: tierBullets([
      `Everything in ${TIER_PRICING.residence.label}`,
      "150 tracked pages per community",
    ]),
    monthlyKey: "community_monthly",
    yearlyKey: "community_yearly",
    monthlyUnitUsd: TIER_PRICING.community.monthlyUsd,
    yearlyUnitUsd: TIER_PRICING.community.yearlyUsd,
  },
  {
    id: "portfolio",
    name: `${TIER_PRICING.portfolio.label} per community`,
    tagline: TIER_PRICING.portfolio.tagline,
    limitsNote: formatPlanLimitsShort(PLAN_LIMITS_BY_SLUG.portfolio_monthly),
    bullets: tierBullets([
      `Everything in ${TIER_PRICING.community.label}`,
      "500 tracked pages per community",
    ]),
    monthlyKey: "portfolio_monthly",
    yearlyKey: "portfolio_yearly",
    monthlyUnitUsd: TIER_PRICING.portfolio.monthlyUsd,
    yearlyUnitUsd: TIER_PRICING.portfolio.yearlyUsd,
  },
];

const PLAN_LABELS: Record<string, string> = {
  residence_monthly: `${TIER_PRICING.residence.label} per community (monthly)`,
  residence_yearly: `${TIER_PRICING.residence.label} per community (yearly)`,
  community_monthly: `${TIER_PRICING.community.label} per community (monthly)`,
  community_yearly: `${TIER_PRICING.community.label} per community (yearly)`,
  portfolio_monthly: `${TIER_PRICING.portfolio.label} per community (monthly)`,
  portfolio_yearly: `${TIER_PRICING.portfolio.label} per community (yearly)`,
  partner_monthly: "Partner program",
  unknown: "Unknown plan",
};

/** Human-readable label for `subscriptions.plan` slug */
export function formatPlanLabel(planSlug: string | null | undefined): string {
  if (!planSlug) return "No active plan";
  return PLAN_LABELS[planSlug] ?? planSlug;
}

/** Format whole-dollar USD without trailing zeros. */
export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Friendly status line for Stripe subscription statuses */
export function formatSubscriptionStatus(status: string | null | undefined): string {
  if (!status) return "—";
  const map: Record<string, string> = {
    active: "Active",
    trialing: "Trialing",
    past_due: "Past due",
    canceled: "Canceled",
    unpaid: "Unpaid",
    incomplete: "Incomplete",
    incomplete_expired: "Expired",
    paused: "Paused",
  };
  return map[status] ?? status;
}
