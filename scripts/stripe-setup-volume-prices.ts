/**
 * Create Stripe **volume-tiered** Prices for Basic / Plus / Pro (monthly + yearly).
 *
 * Stripe Prices are immutable — this creates **new** prices on the same Product as
 * your current env Price IDs, then prints updated `STRIPE_PRICE_*` lines for `.env`.
 *
 * Usage (from repo root):
 *   npx tsx --env-file=.env scripts/stripe-setup-volume-prices.ts
 *   npx tsx --env-file=.env scripts/stripe-setup-volume-prices.ts --apply
 *   npx tsx --env-file=.env scripts/stripe-setup-volume-prices.ts --apply --deactivate-old
 *
 * Requires: STRIPE_SECRET_KEY and existing STRIPE_PRICE_* IDs (used to resolve Product).
 */

import Stripe from "stripe";

import { buildStripeVolumeTierApiRows } from "../lib/billing/stripe-volume-price-payload";
import { TIER_PRICING } from "../lib/billing/plan-limits";

type TierSlug = keyof typeof TIER_PRICING;
type Interval = "month" | "year";

const SPECS: Array<{
  envKey: string;
  tier: TierSlug;
  interval: Interval;
  listUnitUsd: number;
  nickname: string;
}> = [
  {
    envKey: "STRIPE_PRICE_RESIDENCE_MONTHLY",
    tier: "residence",
    interval: "month",
    listUnitUsd: TIER_PRICING.residence.monthlyUsd,
    nickname: "RankLume Basic — monthly (volume)",
  },
  {
    envKey: "STRIPE_PRICE_RESIDENCE_YEARLY",
    tier: "residence",
    interval: "year",
    listUnitUsd: TIER_PRICING.residence.yearlyUsd,
    nickname: "RankLume Basic — yearly (volume)",
  },
  {
    envKey: "STRIPE_PRICE_COMMUNITY_MONTHLY",
    tier: "community",
    interval: "month",
    listUnitUsd: TIER_PRICING.community.monthlyUsd,
    nickname: "RankLume Plus — monthly (volume)",
  },
  {
    envKey: "STRIPE_PRICE_COMMUNITY_YEARLY",
    tier: "community",
    interval: "year",
    listUnitUsd: TIER_PRICING.community.yearlyUsd,
    nickname: "RankLume Plus — yearly (volume)",
  },
  {
    envKey: "STRIPE_PRICE_PORTFOLIO_MONTHLY",
    tier: "portfolio",
    interval: "month",
    listUnitUsd: TIER_PRICING.portfolio.monthlyUsd,
    nickname: "RankLume Pro — monthly (volume)",
  },
  {
    envKey: "STRIPE_PRICE_PORTFOLIO_YEARLY",
    tier: "portfolio",
    interval: "year",
    listUnitUsd: TIER_PRICING.portfolio.yearlyUsd,
    nickname: "RankLume Pro — yearly (volume)",
  },
];

function productIdFromPrice(price: Stripe.Price): string {
  const p = price.product;
  if (typeof p === "string") return p;
  if (p && typeof p === "object" && "id" in p) return p.id;
  throw new Error(`Price ${price.id} has no product id`);
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const deactivateOld = process.argv.includes("--deactivate-old");
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.error("Missing STRIPE_SECRET_KEY. Run with: npx tsx --env-file=.env ...");
    process.exit(1);
  }

  const stripe = new Stripe(key, { typescript: true });
  const envUpdates: string[] = [];

  console.log(
    apply
      ? "Creating volume-tiered Prices on Stripe…\n"
      : "Dry run (pass --apply to create). Payloads:\n",
  );

  for (const spec of SPECS) {
    const oldPriceId = process.env[spec.envKey]?.trim();
    if (!oldPriceId) {
      console.warn(`Skip ${spec.envKey}: not set in env`);
      continue;
    }

    const oldPrice = await stripe.prices.retrieve(oldPriceId);
    const productId = productIdFromPrice(oldPrice);
    const tiers = buildStripeVolumeTierApiRows(spec.listUnitUsd);

    const payload: Stripe.PriceCreateParams = {
      product: productId,
      currency: "usd",
      nickname: spec.nickname,
      recurring: { interval: spec.interval },
      billing_scheme: "tiered",
      tiers_mode: "volume",
      tiers,
    };

    console.log(`--- ${spec.envKey} (${spec.nickname}) ---`);
    console.log(`  product: ${productId}`);
    console.log(`  old price: ${oldPriceId}`);
    console.log(`  tiers: ${JSON.stringify(tiers)}`);

    if (!apply) continue;

    const created = await stripe.prices.create(payload);
    envUpdates.push(`${spec.envKey}=${created.id}`);
    console.log(`  created: ${created.id}`);

    if (deactivateOld && oldPriceId !== created.id) {
      await stripe.prices.update(oldPriceId, { active: false });
      console.log(`  deactivated old: ${oldPriceId}`);
    }
  }

  if (apply && envUpdates.length > 0) {
    console.log("\n# Paste into .env (replace tier price IDs):\n");
    for (const line of envUpdates) console.log(line);
    console.log(
      "\nExisting subscriptions keep old price items until you change plan in the app.",
    );
  } else if (!apply) {
    console.log("\nRe-run with --apply to create prices. Add --deactivate-old to archive previous price IDs.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
