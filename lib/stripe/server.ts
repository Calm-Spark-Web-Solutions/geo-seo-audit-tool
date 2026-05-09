import Stripe from "stripe";

/**
 * Singleton Stripe client for server-side usage only (Checkout, Portal,
 * webhooks). Instantiate lazily so `npm run build` without STRIPE_SECRET_KEY
 * does not throw at module load — routes that need Stripe validate first.
 */
let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }
  if (!stripeSingleton) {
    // Omit pinned apiVersion — Stripe pins compatible defaults per SDK release.
    stripeSingleton = new Stripe(key, { typescript: true });
  }
  return stripeSingleton;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}
