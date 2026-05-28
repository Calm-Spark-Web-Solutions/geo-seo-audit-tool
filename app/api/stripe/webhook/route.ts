import type Stripe from "stripe";

import { PACK_PRICING, RUNS_PACK_PRICING } from "@/lib/billing/plan-limits";
import { classifySubscriptionItems } from "@/lib/billing/subscription-items";
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

  await warnIfMultipleLiveSubscriptions(customerId, subscription.id);
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

  await warnIfMultipleLiveSubscriptions(customerId, subscription.id);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.supabase_user_id?.trim();
  if (!userId) return;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;
  if (!customerId) return;

  // Use the tier item (if any) to label the plan slug on the canceled row;
  // an add-on-only subscription has no meaningful slug so falls through to
  // the raw price id.
  const summary = classifySubscriptionItems(subscription);
  const plan =
    summary.tier?.slug ??
    (summary.firstPriceId ? `unknown_price:${summary.firstPriceId}` : "canceled");

  const service = createServiceClient();
  await service.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_sub_id: subscription.id,
      plan,
      status: "canceled",
      // Clear the community count and add-ons so revoked subscriptions
      // stop consuming bucket capacity in `loadBillingContext` /
      // `getAuditQuotaSnapshot`.
      plan_limits: null,
    },
    { onConflict: "user_id" },
  );
}

const LIVE_STRIPE_STATUSES: Stripe.SubscriptionListParams.Status[] = [
  "active",
  "trialing",
  "past_due",
];

async function warnIfMultipleLiveSubscriptions(
  customerId: string,
  currentSubId: string,
): Promise<void> {
  const stripe = getStripe();
  const otherSubIds: string[] = [];
  for (const status of LIVE_STRIPE_STATUSES) {
    const page = await stripe.subscriptions.list({
      customer: customerId,
      status,
      limit: 100,
    });
    for (const sub of page.data) {
      if (sub.id !== currentSubId) {
        otherSubIds.push(sub.id);
      }
    }
  }
  if (otherSubIds.length > 0) {
    console.warn(
      "[stripe webhook] customer has multiple live subscriptions:",
      { customerId, currentSubId, otherSubIds },
    );
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
  const summary = classifySubscriptionItems(subscription);
  const status = subscription.status;

  // Plan slug = tier item's slug. Add-on-only subscriptions (no tier) are
  // not a thing we sell today; fall back to the raw price id for visibility
  // in `subscriptions.plan` so we don't silently mark them as the free
  // tier.
  const plan =
    summary.tier?.slug ??
    (summary.firstPriceId
      ? `unknown_price:${summary.firstPriceId}`
      : "unknown");

  // Stripe carries the purchased community count as the tier item's
  // quantity. Page Pack quantity is `packs × communities` on the add-on
  // item — we divide it back out so `plan_limits` stays in per-community
  // units (`newPagesPackBonusPerMonth = packs * newPagesPerUnit`).
  const communities = summary.tier?.quantity ?? 1;
  let newPagesPackBonusPerMonth = 0;
  if (summary.pagesPack && communities > 0) {
    const packsPerCommunity = Math.floor(summary.pagesPack.quantity / communities);
    newPagesPackBonusPerMonth = Math.max(
      0,
      packsPerCommunity * PACK_PRICING.newPagesPerUnit,
    );
  }
  let monthlyScansPackBonusPerMonth = 0;
  if (summary.runsPack && communities > 0) {
    const runsPacksPerCommunity = Math.floor(
      summary.runsPack.quantity / communities,
    );
    monthlyScansPackBonusPerMonth = Math.max(
      0,
      runsPacksPerCommunity * RUNS_PACK_PRICING.monthlyScansPerUnit,
    );
  }

  const planLimits: Record<string, number | string> = {
    communities,
    newPagesPackBonusPerMonth,
    monthlyScansPackBonusPerMonth,
  };
  if (typeof subscription.trial_start === "number") {
    planLimits.billing_trial_start = new Date(
      subscription.trial_start * 1000,
    ).toISOString();
  }
  if (typeof subscription.trial_end === "number") {
    planLimits.billing_trial_end = new Date(
      subscription.trial_end * 1000,
    ).toISOString();
  }

  const service = createServiceClient();
  await service.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_sub_id: subscription.id,
      plan,
      status,
      plan_limits: planLimits,
    },
    { onConflict: "user_id" },
  );
}
