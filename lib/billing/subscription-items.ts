import type Stripe from "stripe";

import {
  isCheckoutAddonPriceKey,
  isCheckoutTierPriceKey,
  planSlugFromStripePriceId,
} from "@/lib/billing/price-map";

export interface ClassifiedSubscriptionItem {
  slug: string;
  quantity: number;
  itemId: string;
}

export interface SubscriptionItemSummary {
  tier: ClassifiedSubscriptionItem | null;
  pagesPack: ClassifiedSubscriptionItem | null;
  runsPack: ClassifiedSubscriptionItem | null;
  /** Raw price id of the first item, used for fallback labeling only. */
  firstPriceId: string | null;
}

function isPagesPackSlug(slug: string): boolean {
  return slug === "pages_pack_monthly" || slug === "pages_pack_yearly";
}

function isRunsPackSlug(slug: string): boolean {
  return slug === "runs_pack_monthly" || slug === "runs_pack_yearly";
}

function itemQuantity(item: Stripe.SubscriptionItem): number {
  const quantityRaw = item.quantity;
  return typeof quantityRaw === "number" &&
    Number.isFinite(quantityRaw) &&
    quantityRaw > 0
    ? Math.floor(quantityRaw)
    : 1;
}

/**
 * Iterate subscription items once, splitting them into a tier item and
 * optional Page Pack / Run Pack add-ons. If Stripe sends duplicate add-ons
 * of the same kind, the first wins.
 */
export function classifySubscriptionItems(
  subscription: Stripe.Subscription,
): SubscriptionItemSummary {
  let tier: ClassifiedSubscriptionItem | null = null;
  let pagesPack: ClassifiedSubscriptionItem | null = null;
  let runsPack: ClassifiedSubscriptionItem | null = null;
  let firstPriceId: string | null = null;

  for (const item of subscription.items.data) {
    const priceId = item.price?.id ?? "";
    if (!firstPriceId && priceId) firstPriceId = priceId;

    const slug = planSlugFromStripePriceId(priceId);
    if (!slug || !item.id) continue;

    const quantity = itemQuantity(item);
    const classified = { slug, quantity, itemId: item.id };

    if (!tier && isCheckoutTierPriceKey(slug)) {
      tier = classified;
      continue;
    }
    if (isCheckoutAddonPriceKey(slug)) {
      if (!pagesPack && isPagesPackSlug(slug)) {
        pagesPack = classified;
        continue;
      }
      if (!runsPack && isRunsPackSlug(slug)) {
        runsPack = classified;
        continue;
      }
    }
  }

  return { tier, pagesPack, runsPack, firstPriceId };
}
