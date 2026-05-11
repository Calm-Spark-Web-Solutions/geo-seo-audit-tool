import { PARTNER_PROGRAM, PUBLIC_TIERS } from "@/lib/billing/plans";
import { getStripePriceId } from "@/lib/billing/price-map";
import type { Subscription } from "@/types";

import {
  openBillingPortalSession,
  startCheckoutSession,
} from "@/lib/billing/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Props {
  subscription: Subscription | null;
  stripeConfigured: boolean;
}

function CheckoutForm({
  priceKey,
  label,
  disabled,
}: {
  priceKey: string;
  label: string;
  disabled: boolean;
}) {
  return (
    <form action={startCheckoutSession}>
      <input type="hidden" name="priceKey" value={priceKey} />
      <Button type="submit" size="sm" className="w-full" disabled={disabled}>
        {label}
      </Button>
    </form>
  );
}

export function PricingCards({ subscription, stripeConfigured }: Props) {
  const hasCustomer = Boolean(subscription?.stripe_customer_id?.trim());
  const partnerPriceReady = Boolean(getStripePriceId("partner_monthly"));
  const showPartnerCheckout =
    process.env.NEXT_PUBLIC_SHOW_PARTNER_CHECKOUT === "1";

  const billingBlocked = !stripeConfigured;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PUBLIC_TIERS.map((tier) => {
          const monthlyReady = Boolean(getStripePriceId(tier.monthlyKey));
          const yearlyReady = Boolean(getStripePriceId(tier.yearlyKey));

          return (
            <Card key={tier.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg">{tier.name}</CardTitle>
                <CardDescription>{tier.tagline}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3 text-sm">
                <p className="text-muted-foreground">{tier.limitsNote}</p>
                <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                  {tier.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium tabular-nums">
                      {tier.monthlyDisplay}
                    </span>
                    <CheckoutForm
                      priceKey={tier.monthlyKey}
                      label="Subscribe monthly"
                      disabled={
                        billingBlocked || !monthlyReady
                      }
                    />
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium tabular-nums">
                      {tier.yearlyDisplay}
                    </span>
                    <CheckoutForm
                      priceKey={tier.yearlyKey}
                      label="Subscribe yearly"
                      disabled={
                        billingBlocked || !yearlyReady
                      }
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="text-xs text-muted-foreground">
                {!stripeConfigured
                  ? "Set Stripe keys to enable checkout."
                  : !monthlyReady && !yearlyReady
                    ? `Add Price IDs for ${tier.name} in your environment.`
                    : null}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">{PARTNER_PROGRAM.name}</CardTitle>
          <CardDescription>{PARTNER_PROGRAM.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{PARTNER_PROGRAM.priceNote}</p>
          {showPartnerCheckout && partnerPriceReady ? (
            <form action={startCheckoutSession} className="shrink-0">
              <input
                type="hidden"
                name="priceKey"
                value={PARTNER_PROGRAM.checkoutKey}
              />
              <Button type="submit" variant="secondary" disabled={billingBlocked}>
                Start Partner checkout
              </Button>
            </form>
          ) : (
            <span className="max-w-md text-xs text-muted-foreground">
              {showPartnerCheckout && !partnerPriceReady ? (
                <>
                  Set{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    STRIPE_PRICE_PARTNER_MONTHLY
                  </code>{" "}
                  to enable checkout.
                </>
              ) : (
                <>
                  Checkout is invite-only. Turn on{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    NEXT_PUBLIC_SHOW_PARTNER_CHECKOUT=1
                  </code>{" "}
                  when you want the Partner button visible to signed-in users.
                </>
              )}
            </span>
          )}
        </CardContent>
      </Card>

      {hasCustomer && stripeConfigured ? (
        <form action={openBillingPortalSession}>
          <Button type="submit" variant="outline">
            Manage billing & invoices
          </Button>
        </form>
      ) : null}
    </div>
  );
}
