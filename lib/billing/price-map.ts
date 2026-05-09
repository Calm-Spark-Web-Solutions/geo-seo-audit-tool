/**
 * Maps Stripe Price IDs (from env) to stable plan slugs stored in
 * `subscriptions.plan`. Server-only — reads `process.env` at call time.
 */

export const CHECKOUT_PRICE_KEYS = [
  "residence_monthly",
  "residence_yearly",
  "community_monthly",
  "community_yearly",
  "portfolio_monthly",
  "portfolio_yearly",
  "partner_monthly",
] as const;

export type CheckoutPriceKey = (typeof CHECKOUT_PRICE_KEYS)[number];

const ENV_KEY: Record<CheckoutPriceKey, string> = {
  residence_monthly: "STRIPE_PRICE_RESIDENCE_MONTHLY",
  residence_yearly: "STRIPE_PRICE_RESIDENCE_YEARLY",
  community_monthly: "STRIPE_PRICE_COMMUNITY_MONTHLY",
  community_yearly: "STRIPE_PRICE_COMMUNITY_YEARLY",
  portfolio_monthly: "STRIPE_PRICE_PORTFOLIO_MONTHLY",
  portfolio_yearly: "STRIPE_PRICE_PORTFOLIO_YEARLY",
  partner_monthly: "STRIPE_PRICE_PARTNER_MONTHLY",
};

/** Resolve env var name for a checkout key (for error messages). */
export function envVarForPriceKey(key: CheckoutPriceKey): string {
  return ENV_KEY[key];
}

export function getStripePriceId(key: CheckoutPriceKey): string | null {
  const name = ENV_KEY[key];
  const raw = process.env[name]?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/** Reverse lookup for webhook sync: Price ID → plan slug. */
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
