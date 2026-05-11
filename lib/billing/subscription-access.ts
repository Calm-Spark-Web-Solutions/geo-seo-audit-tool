import type { Subscription } from "@/types";

/** Stripe statuses that may use paid product flows (audit start, PDF, etc.). */
const ALLOWED_STATUSES = new Set(["active", "trialing"]);

export function subscriptionRowAllowsProductUse(
  status: string | null | undefined,
): boolean {
  if (!status) return false;
  return ALLOWED_STATUSES.has(status);
}

/**
 * When Stripe is not configured, audits/PDF stay available for local/dev.
 * When configured, requires an allowed subscription status unless
 * `ALLOW_AUDITS_WITHOUT_SUBSCRIPTION=1` is set (preview/staging escape hatch).
 */
export function userAllowedPaidProductFeatures(
  stripeConfigured: boolean,
  subscription: Pick<Subscription, "status"> | null | undefined,
): boolean {
  if (!stripeConfigured) return true;
  if (process.env.ALLOW_AUDITS_WITHOUT_SUBSCRIPTION === "1") return true;
  return subscriptionRowAllowsProductUse(subscription?.status ?? null);
}
