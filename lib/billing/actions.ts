"use server";

import { redirect } from "next/navigation";

import { getStripePriceId, isCheckoutPriceKey } from "@/lib/billing/price-map";
import { createClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";

function baseSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

export async function startCheckoutSession(formData: FormData) {
  const rawKey = formData.get("priceKey");
  const priceKey =
    typeof rawKey === "string" && isCheckoutPriceKey(rawKey) ? rawKey : null;
  if (!priceKey) {
    redirect("/settings?billing=invalid");
  }

  if (!isStripeConfigured()) {
    redirect("/settings?billing=unconfigured");
  }

  const priceId = getStripePriceId(priceKey);
  if (!priceId) {
    redirect("/settings?billing=missing_price");
  }

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

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
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
