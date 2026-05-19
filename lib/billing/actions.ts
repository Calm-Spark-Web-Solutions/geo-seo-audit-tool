"use server";

import { redirect } from "next/navigation";
import type Stripe from "stripe";

import {
  COMMUNITY_QUANTITY_HARD_MAX,
  COMMUNITY_QUANTITY_HARD_MIN,
  maxAddonPacksPerCommunity,
} from "@/lib/billing/plan-limits";
import {
  getStripePriceId,
  isCheckoutPriceKey,
  isCheckoutTierPriceKey,
} from "@/lib/billing/price-map";
import { createClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";

function baseSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

function parseInteger(
  raw: FormDataEntryValue | null,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof raw !== "string") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

// A subscription in one of these states is "live" enough that creating a
// second Checkout session would result in a duplicate Stripe subscription
// (and a duplicate charge on next renewal). Route those clicks through the
// Customer Portal so quantity / tier / Page Pack changes apply to the
// existing subscription with Stripe-managed proration.
const PORTAL_GATE_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "trialing",
  "past_due",
]);

async function redirectToCustomerPortal(
  stripe: Stripe,
  customerId: string,
  site: string,
): Promise<never> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${site}/settings`,
  });
  if (!session.url) {
    redirect("/settings?billing=error");
  }
  redirect(session.url);
}

export async function startCheckoutSession(formData: FormData) {
  const rawKey = formData.get("priceKey");
  const priceKey =
    typeof rawKey === "string" && isCheckoutPriceKey(rawKey) ? rawKey : null;
  if (!priceKey) {
    redirect("/settings?billing=invalid");
  }
  // The checkout entry point is always a tier price (the Page Pack add-on
  // attaches as a second line item). Reject add-on slugs to avoid creating
  // a subscription that has only the bonus and no tier.
  if (!isCheckoutTierPriceKey(priceKey)) {
    redirect("/settings?billing=invalid");
  }

  if (!isStripeConfigured()) {
    redirect("/settings?billing=unconfigured");
  }

  const priceId = getStripePriceId(priceKey);
  if (!priceId) {
    redirect("/settings?billing=missing_price");
  }

  // Partner / single-seat SKUs ignore quantity; all other tiers take a
  // community count and bill `unit_amount × quantity` via Stripe seats.
  const quantity =
    priceKey === "partner_monthly"
      ? 1
      : parseInteger(
          formData.get("quantity"),
          COMMUNITY_QUANTITY_HARD_MIN,
          COMMUNITY_QUANTITY_HARD_MAX,
          1,
        );

  const maxPacks = maxAddonPacksPerCommunity(priceKey);

  // Optional Page Pack add-on. `pagesPackQuantity` is **packs per community**;
  // Stripe's `line_items[].quantity` for the pack price is
  // `packsPerCommunity × communities`, since each unit on the Stripe Price
  // is `unit_amount` for "+1 pack on +1 community".
  const packsUpper =
    maxPacks === null ? 9_999 : maxPacks;
  const packsPerCommunity = parseInteger(
    formData.get("pagesPackQuantity"),
    0,
    packsUpper,
    0,
  );
  const packPriceKey =
    priceKey.endsWith("_yearly") ? "pages_pack_yearly" : "pages_pack_monthly";
  const packPriceId =
    packsPerCommunity > 0 ? getStripePriceId(packPriceKey) : null;
  // If the customer asked for Page Packs but we have no Stripe Price for
  // the matching cycle, fail loudly instead of silently billing the tier
  // only. Better the user re-tries than gets a surprise short bill.
  if (packsPerCommunity > 0 && !packPriceId) {
    redirect("/settings?billing=missing_price");
  }
  const includePackItem = packsPerCommunity > 0 && Boolean(packPriceId);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id, status, stripe_sub_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const stripe = getStripe();
  const site = baseSiteUrl();

  // Foot-gun guard: an existing live subscription + a fresh Checkout
  // session would create a SECOND Stripe subscription (and a duplicate
  // charge on next renewal). Send the user to the Customer Portal so any
  // quantity / tier / Page Pack changes apply to the existing sub with
  // Stripe-managed proration. Run Packs are not sold via Checkout; customers
  // raise manual audit capacity by upgrading tiers or via the portal if legacy
  // items exist.
  if (
    existing?.stripe_customer_id &&
    existing?.status &&
    PORTAL_GATE_STATUSES.has(existing.status)
  ) {
    await redirectToCustomerPortal(stripe, existing.stripe_customer_id, site);
  }

  const lineItems: { price: string; quantity: number }[] = [
    { price: priceId!, quantity },
  ];
  if (includePackItem) {
    lineItems.push({
      price: packPriceId!,
      quantity: packsPerCommunity * quantity,
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: lineItems,
    success_url: `${site}/settings?billing=success`,
    cancel_url: `${site}/settings?billing=cancel`,
    client_reference_id: user.id,
    metadata: { supabase_user_id: user.id },
    subscription_data: {
      trial_period_days: 14,
      metadata: { supabase_user_id: user.id },
    },
    payment_method_collection: "if_required",
    ...(existing?.stripe_customer_id
      ? { customer: existing.stripe_customer_id }
      : { customer_email: user.email ?? undefined }),
  });

  if (!session.url) {
    redirect("/settings?billing=error");
  }
  redirect(session.url);
}

export async function openBillingPortalSession() {
  if (!isStripeConfigured()) {
    redirect("/settings?billing=unconfigured");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: row } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const customerId = row?.stripe_customer_id?.trim();
  if (!customerId) {
    redirect("/settings?billing=no_customer");
  }

  const stripe = getStripe();
  const site = baseSiteUrl();

  await redirectToCustomerPortal(stripe, customerId, site);
}
