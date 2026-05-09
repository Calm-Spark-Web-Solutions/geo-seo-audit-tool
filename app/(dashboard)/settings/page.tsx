import { redirect } from "next/navigation";

import { BillingAlert } from "@/components/billing/BillingAlert";
import { PricingCards } from "@/components/billing/PricingCards";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatPlanLabel,
  formatSubscriptionStatus,
} from "@/lib/billing/plans";
import { createClient } from "@/lib/supabase/server";
import { isStripeConfigured } from "@/lib/stripe/server";
import type { Subscription } from "@/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const billingRaw = sp.billing;
  const billingCode =
    typeof billingRaw === "string"
      ? billingRaw
      : Array.isArray(billingRaw)
        ? billingRaw[0]
        : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const subscription = subRow as Subscription | null;
  const stripeConfigured = isStripeConfigured();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Account, plan, and billing."
      />

      <BillingAlert code={billingCode} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current plan</CardTitle>
          <CardDescription>
            Subscription is tracked per login. Usage limits are not enforced yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Plan: </span>
            <span className="font-medium">
              {formatPlanLabel(subscription?.plan)}
            </span>
          </p>
          <p>
            <span className="text-muted-foreground">Status: </span>
            <span className="font-medium">
              {formatSubscriptionStatus(subscription?.status)}
            </span>
          </p>
          {!stripeConfigured ? (
            <p className="pt-2 text-muted-foreground">
              Add <code className="rounded bg-muted px-1 py-0.5">STRIPE_SECRET_KEY</code>{" "}
              and Price IDs to enable Stripe Checkout and webhooks.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Pricing</h2>
        <p className="text-sm text-muted-foreground">
          Choose a public tier below, or read about the Partner program for
          invitation-only pricing.
        </p>
        <PricingCards
          subscription={subscription}
          stripeConfigured={stripeConfigured}
        />
      </div>
    </>
  );
}
