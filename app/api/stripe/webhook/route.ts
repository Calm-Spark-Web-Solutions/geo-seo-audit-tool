import type Stripe from "stripe";

import {
  planSlugFromStripePriceId,
} from "@/lib/billing/price-map";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe/server";

export const runtime = "nodejs";

/**
 * Stripe sends the raw body for signature verification — do not parse JSON first.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET not set");
    return new Response("Webhook not configured", { status: 503 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.warn(
      "[stripe webhook] signature verification failed:",
      err instanceof Error ? err.message : err,
    );
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("[stripe webhook] handler error:", err);
    return new Response("Webhook handler failed", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== "subscription") return;

  const userId =
    session.client_reference_id?.trim() ||
    session.metadata?.supabase_user_id?.trim();
  const subRef = session.subscription;
  const subId =
    typeof subRef === "string"
      ? subRef
      : subRef && typeof subRef === "object" && "id" in subRef
        ? (subRef as Stripe.Subscription).id
        : null;

  if (!userId || !subId) {
    console.warn(
      "[stripe webhook] checkout.session.completed missing user or subscription id",
    );
    return;
  }

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subId);
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  if (!customerId) {
    console.warn("[stripe webhook] checkout session missing customer id");
    return;
  }

  await upsertSubscriptionFromStripe({
    userId,
    customerId,
    subscription,
  });
}

async function handleSubscriptionUpsert(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.supabase_user_id?.trim();
  if (!userId) {
    console.warn(
      "[stripe webhook] subscription event missing metadata.supabase_user_id",
    );
    return;
  }
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;
  if (!customerId) return;

  await upsertSubscriptionFromStripe({
    userId,
    customerId,
    subscription,
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.supabase_user_id?.trim();
  if (!userId) return;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;
  if (!customerId) return;

  const priceId = subscription.items.data[0]?.price?.id ?? "";
  const plan =
    planSlugFromStripePriceId(priceId) ??
    (priceId ? `unknown_price:${priceId}` : "canceled");

  const service = createServiceClient();
  const { data: existing } = await service
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  const payload = {
    stripe_customer_id: customerId,
    stripe_sub_id: subscription.id,
    plan,
    status: "canceled",
  };

  if (existing?.id) {
    await service.from("subscriptions").update(payload).eq("user_id", userId);
  } else {
    await service.from("subscriptions").insert({
      user_id: userId,
      ...payload,
    });
  }
}

async function upsertSubscriptionFromStripe({
  userId,
  customerId,
  subscription,
}: {
  userId: string;
  customerId: string;
  subscription: Stripe.Subscription;
}) {
  const priceId = subscription.items.data[0]?.price?.id ?? "";
  const plan =
    planSlugFromStripePriceId(priceId) ?? `unknown_price:${priceId}`;
  const status = subscription.status;

  const service = createServiceClient();
  const { data: existing } = await service
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  const payload = {
    stripe_customer_id: customerId,
    stripe_sub_id: subscription.id,
    plan,
    status,
  };

  if (existing?.id) {
    await service.from("subscriptions").update(payload).eq("user_id", userId);
  } else {
    await service.from("subscriptions").insert({
      user_id: userId,
      ...payload,
    });
  }
}
