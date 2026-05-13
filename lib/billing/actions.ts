"use server";

import { redirect } from "next/navigation";

import {
  COMMUNITY_QUANTITY_HARD_MAX,
  COMMUNITY_QUANTITY_HARD_MIN,
  PACK_PRICING,
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

  // Optional Page Pack add-on. `pagesPackQuantity` is **packs per community**;
  // Stripe's `line_items[].quantity` for the pack price is
  // `packsPerCommunity × communities`, since each unit on the Stripe Price
  // is `unit_amount` for "+1 pack on +1 community".
  const packsPerCommunity = parseInteger(
    formData.get("pagesPackQuantity"),
    0,
    PACK_PRICING.hardMaxPacksPerCommunity,
    0,
  );
  const packPriceKey =
    priceKey.endsWith("_yearly") ? "pages_pack_yearly" : "pages_pack_monthly";
  const packPriceId =
    packsPerCommunity > 0 ? getStripePriceId(packPriceKey) : null;
  // Silently drop the add-on if the Stripe Price isn't configured for the
  // matching cycle — we'd rather complete checkout for the tier than fail.
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
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const stripe = getStripe();
  const site = baseSiteUrl();

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
      metadata: { supabase_user_id: user.id },
    },
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

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${site}/settings`,
  });

  if (!session.url) {
    redirect("/settings?billing=error");
  }
  redirect(session.url);
}
