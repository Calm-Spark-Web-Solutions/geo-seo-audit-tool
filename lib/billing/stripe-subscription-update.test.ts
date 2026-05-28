import type Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildSubscriptionUpdateItems,
  planBuilderMatchesSubscription,
} from "@/lib/billing/stripe-subscription-update";

const TIER_MONTHLY = "price_residence_monthly";
const TIER_YEARLY = "price_residence_yearly";
const COMMUNITY_MONTHLY = "price_community_monthly";
const PACK_MONTHLY = "price_pages_pack_monthly";
const PACK_YEARLY = "price_pages_pack_yearly";

function mockSubscription(
  items: Array<{
    id: string;
    priceId: string;
    quantity?: number;
  }>,
): Stripe.Subscription {
  return {
    id: "sub_test",
    items: {
      data: items.map((item) => ({
        id: item.id,
        quantity: item.quantity ?? 1,
        price: { id: item.priceId },
      })),
    },
  } as Stripe.Subscription;
}

describe("buildSubscriptionUpdateItems", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("updates tier price and quantity only", () => {
    vi.stubEnv("STRIPE_PRICE_COMMUNITY_MONTHLY", COMMUNITY_MONTHLY);
    vi.stubEnv("STRIPE_PRICE_RESIDENCE_MONTHLY", TIER_MONTHLY);

    const sub = mockSubscription([
      { id: "si_tier", priceId: TIER_MONTHLY, quantity: 2 },
    ]);

    const result = buildSubscriptionUpdateItems(sub, {
      tierPriceKey: "community_monthly",
      quantity: 5,
      packsPerCommunity: 0,
    });

    expect(result).toEqual({
      ok: true,
      items: [{ id: "si_tier", price: COMMUNITY_MONTHLY, quantity: 5 }],
    });
  });

  it("adds page pack line when none exists", () => {
    vi.stubEnv("STRIPE_PRICE_RESIDENCE_MONTHLY", TIER_MONTHLY);
    vi.stubEnv("STRIPE_PRICE_PAGES_PACK_MONTHLY", PACK_MONTHLY);

    const sub = mockSubscription([{ id: "si_tier", priceId: TIER_MONTHLY, quantity: 3 }]);

    const result = buildSubscriptionUpdateItems(sub, {
      tierPriceKey: "residence_monthly",
      quantity: 3,
      packsPerCommunity: 2,
    });

    expect(result).toEqual({
      ok: true,
      items: [
        { id: "si_tier", price: TIER_MONTHLY, quantity: 3 },
        { price: PACK_MONTHLY, quantity: 6 },
      ],
    });
  });

  it("updates existing page pack and swaps yearly pack price on interval change", () => {
    vi.stubEnv("STRIPE_PRICE_RESIDENCE_MONTHLY", TIER_MONTHLY);
    vi.stubEnv("STRIPE_PRICE_RESIDENCE_YEARLY", TIER_YEARLY);
    vi.stubEnv("STRIPE_PRICE_PAGES_PACK_MONTHLY", PACK_MONTHLY);
    vi.stubEnv("STRIPE_PRICE_PAGES_PACK_YEARLY", PACK_YEARLY);

    const sub = mockSubscription([
      { id: "si_tier", priceId: TIER_MONTHLY, quantity: 2 },
      { id: "si_pack", priceId: PACK_MONTHLY, quantity: 4 },
    ]);

    const result = buildSubscriptionUpdateItems(sub, {
      tierPriceKey: "residence_yearly",
      quantity: 2,
      packsPerCommunity: 2,
    });

    expect(result).toEqual({
      ok: true,
      items: [
        { id: "si_tier", price: TIER_YEARLY, quantity: 2 },
        { id: "si_pack", price: PACK_YEARLY, quantity: 4 },
      ],
    });
  });

  it("deletes page pack line when packs set to zero", () => {
    vi.stubEnv("STRIPE_PRICE_RESIDENCE_MONTHLY", TIER_MONTHLY);
    vi.stubEnv("STRIPE_PRICE_PAGES_PACK_MONTHLY", PACK_MONTHLY);

    const sub = mockSubscription([
      { id: "si_tier", priceId: TIER_MONTHLY, quantity: 1 },
      { id: "si_pack", priceId: PACK_MONTHLY, quantity: 2 },
    ]);

    const result = buildSubscriptionUpdateItems(sub, {
      tierPriceKey: "residence_monthly",
      quantity: 1,
      packsPerCommunity: 0,
    });

    expect(result).toEqual({
      ok: true,
      items: [
        { id: "si_tier", price: TIER_MONTHLY, quantity: 1 },
        { id: "si_pack", deleted: true },
      ],
    });
  });
});

describe("planBuilderMatchesSubscription", () => {
  it("returns true when plan, communities, and packs match", () => {
    expect(
      planBuilderMatchesSubscription(
        {
          plan: "community_monthly",
          plan_limits: {
            communities: 4,
            newPagesPackBonusPerMonth: 40,
          },
        },
        {
          tierPriceKey: "community_monthly",
          quantity: 4,
          packsPerCommunity: 2,
        },
      ),
    ).toBe(true);
  });

  it("returns false when tier slug differs", () => {
    expect(
      planBuilderMatchesSubscription(
        {
          plan: "residence_monthly",
          plan_limits: { communities: 1, newPagesPackBonusPerMonth: 0 },
        },
        {
          tierPriceKey: "community_monthly",
          quantity: 1,
          packsPerCommunity: 0,
        },
      ),
    ).toBe(false);
  });
});
