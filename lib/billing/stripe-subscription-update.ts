import type Stripe from "stripe";

import { PACK_PRICING } from "@/lib/billing/plan-limits";
import {
  getStripePriceId,
  type CheckoutTierPriceKey,
} from "@/lib/billing/price-map";
import { classifySubscriptionItems } from "@/lib/billing/subscription-items";

export type SubscriptionUpdateItem =
  | { id: string; price: string; quantity: number }
  | { id: string; deleted: true }
  | { price: string; quantity: number };

export type BuildSubscriptionUpdateResult =
  | { ok: true; items: SubscriptionUpdateItem[] }
  | { ok: false; reason: "missing_tier_price" | "missing_pack_price" | "no_tier_item" };

function pagesPackPriceKeyForTier(
  tierPriceKey: CheckoutTierPriceKey,
): "pages_pack_monthly" | "pages_pack_yearly" {
  return tierPriceKey.endsWith("_yearly")
    ? "pages_pack_yearly"
    : "pages_pack_monthly";
}

/**
 * Build `items` for `stripe.subscriptions.update` from the plan builder
 * selection. Only tier and Page Pack lines are modified; legacy Run Pack
 * items are left unchanged.
 */
export function buildSubscriptionUpdateItems(
  subscription: Stripe.Subscription,
  target: {
    tierPriceKey: CheckoutTierPriceKey;
    quantity: number;
    packsPerCommunity: number;
  },
): BuildSubscriptionUpdateResult {
  const tierPriceId = getStripePriceId(target.tierPriceKey);
  if (!tierPriceId) {
    return { ok: false, reason: "missing_tier_price" };
  }

  const summary = classifySubscriptionItems(subscription);
  const items: SubscriptionUpdateItem[] = [];

  const tierQuantity =
    target.tierPriceKey === "partner_monthly" ? 1 : target.quantity;

  if (summary.tier) {
    items.push({
      id: summary.tier.itemId,
      price: tierPriceId,
      quantity: tierQuantity,
    });
  } else {
    items.push({
      price: tierPriceId,
      quantity: tierQuantity,
    });
  }

  const packLineQuantity = target.packsPerCommunity * tierQuantity;

  if (target.packsPerCommunity > 0) {
    const packPriceKey = pagesPackPriceKeyForTier(target.tierPriceKey);
    const packPriceId = getStripePriceId(packPriceKey);
    if (!packPriceId) {
      return { ok: false, reason: "missing_pack_price" };
    }
    if (summary.pagesPack) {
      items.push({
        id: summary.pagesPack.itemId,
        price: packPriceId,
        quantity: packLineQuantity,
      });
    } else {
      items.push({
        price: packPriceId,
        quantity: packLineQuantity,
      });
    }
  } else if (summary.pagesPack) {
    items.push({
      id: summary.pagesPack.itemId,
      deleted: true,
    });
  }

  if (items.length === 0) {
    return { ok: false, reason: "no_tier_item" };
  }

  return { ok: true, items };
}

/** Compare plan builder selection to a stored subscription row shape. */
export function planBuilderMatchesSubscription(
  subscription: {
    plan: string | null;
    plan_limits: unknown;
  } | null,
  target: {
    tierPriceKey: CheckoutTierPriceKey;
    quantity: number;
    packsPerCommunity: number;
  },
): boolean {
  if (!subscription?.plan) return false;
  if (subscription.plan !== target.tierPriceKey) return false;

  const limits =
    subscription.plan_limits && typeof subscription.plan_limits === "object"
      ? (subscription.plan_limits as Record<string, unknown>)
      : null;
  const communities =
    typeof limits?.communities === "number" && limits.communities > 0
      ? Math.floor(limits.communities)
      : 1;
  const tierQuantity =
    target.tierPriceKey === "partner_monthly" ? 1 : target.quantity;
  if (communities !== tierQuantity) return false;

  const bonus =
    typeof limits?.newPagesPackBonusPerMonth === "number"
      ? limits.newPagesPackBonusPerMonth
      : 0;
  const currentPacks =
    bonus > 0
      ? Math.floor(bonus / PACK_PRICING.newPagesPerUnit)
      : 0;
  return currentPacks === target.packsPerCommunity;
}

export function toStripeSubscriptionUpdateItems(
  items: SubscriptionUpdateItem[],
): Stripe.SubscriptionUpdateParams.Item[] {
  return items as Stripe.SubscriptionUpdateParams.Item[];
}
