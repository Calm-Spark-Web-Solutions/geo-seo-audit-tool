/**
 * Maps Stripe Price IDs (from env) to stable plan slugs stored in
 * `subscriptions.plan`. Server-only — reads `process.env` at call time.
 *
 * Two families of price keys live here:
 *
 *   - **Tier keys** (residence / community / portfolio / partner):
 *     these set `subscriptions.plan` and drive `PLAN_LIMITS_BY_SLUG`.
 *   - **Add-on keys** (`pages_pack_*`, `runs_pack_*`): optional subscription
 *     items for extra new-pages/mo and extra manual runs per community.
 */

export const CHECKOUT_TIER_PRICE_KEYS = [
  "residence_monthly",
  "residence_yearly",
  "community_monthly",
  "community_yearly",
  "portfolio_monthly",
  "portfolio_yearly",
  "partner_monthly",
] as const;

export const CHECKOUT_ADDON_PRICE_KEYS = [
  "pages_pack_monthly",
  "pages_pack_yearly",
  "runs_pack_monthly",
  "runs_pack_yearly",
] as const;

export const CHECKOUT_PRICE_KEYS = [
  ...CHECKOUT_TIER_PRICE_KEYS,
  ...CHECKOUT_ADDON_PRICE_KEYS,
] as const;

export type CheckoutTierPriceKey = (typeof CHECKOUT_TIER_PRICE_KEYS)[number];
export type CheckoutAddonPriceKey = (typeof CHECKOUT_ADDON_PRICE_KEYS)[number];
export type CheckoutPriceKey = (typeof CHECKOUT_PRICE_KEYS)[number];

const ENV_KEY: Record<CheckoutPriceKey, string> = {
  residence_monthly: "STRIPE_PRICE_RESIDENCE_MONTHLY",
  residence_yearly: "STRIPE_PRICE_RESIDENCE_YEARLY",
  community_monthly: "STRIPE_PRICE_COMMUNITY_MONTHLY",
  community_yearly: "STRIPE_PRICE_COMMUNITY_YEARLY",
  portfolio_monthly: "STRIPE_PRICE_PORTFOLIO_MONTHLY",
  portfolio_yearly: "STRIPE_PRICE_PORTFOLIO_YEARLY",
  partner_monthly: "STRIPE_PRICE_PARTNER_MONTHLY",
  pages_pack_monthly: "STRIPE_PRICE_PAGES_PACK_MONTHLY",
  pages_pack_yearly: "STRIPE_PRICE_PAGES_PACK_YEARLY",
  runs_pack_monthly: "STRIPE_PRICE_RUNS_PACK_MONTHLY",
  runs_pack_yearly: "STRIPE_PRICE_RUNS_PACK_YEARLY",
};

export function getStripePriceId(key: CheckoutPriceKey): string | null {
  const name = ENV_KEY[key];
  const raw = process.env[name]?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/**
 * Reverse lookup for webhook sync: Price ID → key (tier or add-on).
 * Returns `null` when the Price ID doesn't match anything we know about,
 * so the webhook can fall back to `unknown_price:<id>` cleanly.
 */
export function planSlugFromStripePriceId(priceId: string): string | null {
  for (const key of CHECKOUT_PRICE_KEYS) {
    const id = getStripePriceId(key);
    if (id && id === priceId) return key;
  }
  return null;
}

export function isCheckoutPriceKey(value: string): value is CheckoutPriceKey {
  return (CHECKOUT_PRICE_KEYS as readonly string[]).includes(value);
}

export function isCheckoutTierPriceKey(
  value: string,
): value is CheckoutTierPriceKey {
  return (CHECKOUT_TIER_PRICE_KEYS as readonly string[]).includes(value);
}

export function isCheckoutAddonPriceKey(
  value: string,
): value is CheckoutAddonPriceKey {
  return (CHECKOUT_ADDON_PRICE_KEYS as readonly string[]).includes(value);
}
