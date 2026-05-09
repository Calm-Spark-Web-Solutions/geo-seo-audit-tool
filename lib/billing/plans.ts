/**
 * Marketing copy for billing tiers. Limits are **not** enforced in app code
 * yet — copy stays honest while you finalize quotas per tier.
 */

import type { CheckoutPriceKey } from "./price-map";

export type PublicTierId = "residence" | "community" | "portfolio";

export interface PublicTierCard {
  id: PublicTierId;
  name: string;
  tagline: string;
  /** Shown in UI; replace when limits are finalized */
  limitsNote: string;
  bullets: string[];
  monthlyKey: CheckoutPriceKey;
  yearlyKey: CheckoutPriceKey;
  monthlyDisplay: string;
  yearlyDisplay: string;
}

/** Three public tiers shown as pricing cards + Partner callout below */
export const PUBLIC_TIERS: PublicTierCard[] = [
  {
    id: "residence",
    name: "Residence",
    tagline: "Single-community operators",
    limitsNote: "Usage limits will appear here once finalized.",
    bullets: [
      "Full SEO + GEO audits with AI commentary",
      "PDF export and audit history",
      "CrUX, PSI, and manual expert checklist",
    ],
    monthlyKey: "residence_monthly",
    yearlyKey: "residence_yearly",
    monthlyDisplay: "$79/mo",
    yearlyDisplay: "$790/yr",
  },
  {
    id: "community",
    name: "Community",
    tagline: "Growing regional operators",
    limitsNote: "Usage limits will appear here once finalized.",
    bullets: [
      "Everything in Residence",
      "More communities and scale headroom",
      "Priority for operational workflows",
    ],
    monthlyKey: "community_monthly",
    yearlyKey: "community_yearly",
    monthlyDisplay: "$199/mo",
    yearlyDisplay: "$1,990/yr",
  },
  {
    id: "portfolio",
    name: "Portfolio",
    tagline: "Multi-site portfolios",
    limitsNote: "Usage limits will appear here once finalized.",
    bullets: [
      "Everything in Community",
      "Designed for agency / multi-brand rollouts",
      "Highest tier for volume and support expectations",
    ],
    monthlyKey: "portfolio_monthly",
    yearlyKey: "portfolio_yearly",
    monthlyDisplay: "$449/mo",
    yearlyDisplay: "$4,490/yr",
  },
];

/** Partner program — replaces “Internal discount” in customer-facing copy */
export const PARTNER_PROGRAM = {
  name: "Partner program",
  description:
    "Available by invitation for organizations we work closely with.",
  priceNote: "$20/mo — invitation only",
  checkoutKey: "partner_monthly",
};

const PLAN_LABELS: Record<string, string> = {
  residence_monthly: "Residence (monthly)",
  residence_yearly: "Residence (yearly)",
  community_monthly: "Community (monthly)",
  community_yearly: "Community (yearly)",
  portfolio_monthly: "Portfolio (monthly)",
  portfolio_yearly: "Portfolio (yearly)",
  partner_monthly: "Partner program",
  unknown: "Unknown plan",
};

/** Human-readable label for `subscriptions.plan` slug */
export function formatPlanLabel(planSlug: string | null | undefined): string {
  if (!planSlug) return "No active plan";
  return PLAN_LABELS[planSlug] ?? planSlug;
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
