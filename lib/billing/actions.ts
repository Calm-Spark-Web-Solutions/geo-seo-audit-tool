"use server";

import { redirect } from "next/navigation";
import type Stripe from "stripe";

import { parsePlanBuilderForm } from "@/lib/billing/plan-builder-form";
import { getStripePriceId } from "@/lib/billing/price-map";
import {
  buildSubscriptionUpdateItems,
  toStripeSubscriptionUpdateItems,
} from "@/lib/billing/stripe-subscription-update";
import { createClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";

function baseSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

// A subscription in one of these states is "live" enough that creating a
// second Checkout session would result in a duplicate Stripe subscription
// (and a duplicate charge on next renewal). Route those clicks through plan
// updates or the Customer Portal instead.
export const PORTAL_GATE_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "trialing",
  "past_due",
]);

const STRIPE_LIVE_STATUSES: Stripe.SubscriptionListParams.Status[] = [
  "active",
  "trialing",
  "past_due",
];

async function redirectToCustomerPortal(
  stripe: Stripe,
  customerId: string,
  site: string,
): Promise<never> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${site}/settings?tab=billing`,
  });
  if (!session.url) {
    redirect("/settings?tab=billing&billing=error");
  }
  redirect(session.url);
}

async function customerHasLiveStripeSubscription(
  stripe: Stripe,
  customerId: string,
): Promise<boolean> {
  for (const status of STRIPE_LIVE_STATUSES) {
    const page = await stripe.subscriptions.list({
      customer: customerId,
      status,
      limit: 1,
    });
    if (page.data.length > 0) return true;
  }
  return false;
}

export async function startCheckoutSession(formData: FormData) {
  const parsed = parsePlanBuilderForm(formData);
  if (!parsed.ok) {
    redirect(`/settings?tab=billing&billing=${parsed.error}`);
  }

  if (!isStripeConfigured()) {
    redirect("/settings?tab=billing&billing=unconfigured");
  }

  const tierStripePriceId = getStripePriceId(parsed.tierPriceKey);
  if (!tierStripePriceId) {
    redirect("/settings?tab=billing&billing=missing_price");
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
    .select("stripe_customer_id, status, stripe_sub_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const stripe = getStripe();
  const site = baseSiteUrl();

  const customerId = existing?.stripe_customer_id?.trim();

  // Foot-gun guard: existing live subscription + Checkout creates a duplicate.
  if (
    customerId &&
    existing?.status &&
    PORTAL_GATE_STATUSES.has(existing.status)
  ) {
    await redirectToCustomerPortal(stripe, customerId, site);
  }

  if (customerId && (await customerHasLiveStripeSubscription(stripe, customerId))) {
    await redirectToCustomerPortal(stripe, customerId, site);
  }

  const lineItems: { price: string; quantity: number }[] = [
    { price: tierStripePriceId, quantity: parsed.quantity },
  ];
  if (parsed.packPriceId) {
    lineItems.push({
      price: parsed.packPriceId,
      quantity: parsed.packsPerCommunity * parsed.quantity,
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: lineItems,
    success_url: `${site}/settings?tab=billing&billing=success`,
    cancel_url: `${site}/settings?tab=billing&billing=cancel`,
    client_reference_id: user.id,
    metadata: { supabase_user_id: user.id },
    subscription_data: {
      trial_period_days: 14,
      metadata: { supabase_user_id: user.id },
    },
    payment_method_collection: "if_required",
    ...(customerId
      ? { customer: customerId }
      : { customer_email: user.email ?? undefined }),
  });

  if (!session.url) {
    redirect("/settings?tab=billing&billing=error");
  }
  redirect(session.url);
}

export async function updateSubscriptionFromPlanBuilder(formData: FormData) {
  const parsed = parsePlanBuilderForm(formData);
  if (!parsed.ok) {
    redirect(`/settings?tab=billing&billing=${parsed.error}`);
  }

  if (!isStripeConfigured()) {
    redirect("/settings?tab=billing&billing=unconfigured");
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
    .select("stripe_customer_id, status, stripe_sub_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const subId = row?.stripe_sub_id?.trim();
  const customerId = row?.stripe_customer_id?.trim();
  if (
    !subId ||
    !customerId ||
    !row?.status ||
    !PORTAL_GATE_STATUSES.has(row.status)
  ) {
    redirect("/settings?tab=billing&billing=no_subscription");
  }

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subId);

  const built = buildSubscriptionUpdateItems(subscription, {
    tierPriceKey: parsed.tierPriceKey,
    quantity: parsed.quantity,
    packsPerCommunity: parsed.packsPerCommunity,
  });

  if (!built.ok) {
    redirect("/settings?tab=billing&billing=missing_price");
  }

  await stripe.subscriptions.update(subId, {
    items: toStripeSubscriptionUpdateItems(built.items),
    proration_behavior: "create_prorations",
  });

  redirect("/settings?tab=billing&billing=updated");
}

export async function openBillingPortalSession() {
  if (!isStripeConfigured()) {
    redirect("/settings?tab=billing&billing=unconfigured");
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
    redirect("/settings?tab=billing&billing=no_customer");
  }

  const stripe = getStripe();
  const site = baseSiteUrl();

  await redirectToCustomerPortal(stripe, customerId, site);
}
