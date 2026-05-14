"use client";

import { Minus, Plus, Sparkles } from "lucide-react";
import { useId, useMemo, useState } from "react";

import {
  openBillingPortalSession,
  startCheckoutSession,
} from "@/lib/billing/actions";
import {
  COMMUNITY_QUANTITY_HARD_MAX,
  COMMUNITY_QUANTITY_HARD_MIN,
  PACK_PRICING,
  PLAN_LIMITS_BY_SLUG,
} from "@/lib/billing/plan-limits";
import {
  PARTNER_PROGRAM,
  PUBLIC_TIERS,
  formatUsd,
  type PublicTierCard,
  type PublicTierId,
} from "@/lib/billing/plans";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Subscription } from "@/types";

interface Props {
  subscription: Subscription | null;
  stripeConfigured: boolean;
}

const QUICK_PICKS: { count: number; label: string }[] = [
  { count: 1, label: "1" },
  { count: 3, label: "3" },
  { count: 5, label: "5" },
  { count: 10, label: "10" },
  { count: 20, label: "20" },
  { count: 50, label: "50" },
];

function clampQuantity(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(
    COMMUNITY_QUANTITY_HARD_MAX,
    Math.max(COMMUNITY_QUANTITY_HARD_MIN, Math.floor(n)),
  );
}

function defaultTierForSubscription(
  plan: string | null | undefined,
): PublicTierId {
  if (!plan) return "community";
  if (plan.startsWith("portfolio")) return "portfolio";
  if (plan.startsWith("residence")) return "residence";
  if (plan.startsWith("community")) return "community";
  return "community";
}

function defaultBillingCycleForSubscription(
  plan: string | null | undefined,
): "monthly" | "yearly" {
  return plan?.endsWith("_yearly") ? "yearly" : "monthly";
}

function defaultQuantityForSubscription(sub: Subscription | null): number {
  const fromOverride =
    sub?.plan_limits && typeof sub.plan_limits === "object"
      ? (sub.plan_limits as Record<string, unknown>).communities
      : null;
  if (typeof fromOverride === "number" && fromOverride > 0) {
    return clampQuantity(fromOverride);
  }
  return 1;
}

function defaultPacksForSubscription(sub: Subscription | null): number {
  const raw =
    sub?.plan_limits && typeof sub.plan_limits === "object"
      ? (sub.plan_limits as Record<string, unknown>).newPagesPackBonusPerMonth
      : null;
  if (typeof raw !== "number" || raw <= 0) return 0;
  const packs = Math.floor(raw / PACK_PRICING.newPagesPerUnit);
  if (packs <= 0) return 0;
  if (packs > PACK_PRICING.hardMaxPacksPerCommunity) {
    return PACK_PRICING.hardMaxPacksPerCommunity;
  }
  return packs;
}

function clampPacks(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(PACK_PRICING.hardMaxPacksPerCommunity, Math.max(0, Math.floor(n)));
}

// Mirror of `PORTAL_GATE_STATUSES` in lib/billing/actions.ts. When the
// user's subscription is in one of these states, clicking Subscribe on a
// tier card opens the Customer Portal instead of creating a duplicate
// Stripe subscription.
const LIVE_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "trialing",
  "past_due",
]);

export function PricingCards({ subscription, stripeConfigured }: Props) {
  const hasCustomer = Boolean(subscription?.stripe_customer_id?.trim());
  const hasLiveSubscription =
    hasCustomer &&
    typeof subscription?.status === "string" &&
    LIVE_SUBSCRIPTION_STATUSES.has(subscription.status);

  const [quantity, setQuantity] = useState<number>(() =>
    defaultQuantityForSubscription(subscription),
  );
  const [cycle, setCycle] = useState<"monthly" | "yearly">(() =>
    defaultBillingCycleForSubscription(subscription?.plan),
  );
  const [selectedTier, setSelectedTier] = useState<PublicTierId>(() =>
    defaultTierForSubscription(subscription?.plan),
  );
  const [packs, setPacks] = useState<number>(() =>
    defaultPacksForSubscription(subscription),
  );

  const quantityInputId = useId();
  const packsInputId = useId();
  const billingBlocked = !stripeConfigured;
  const overMax = quantity >= COMMUNITY_QUANTITY_HARD_MAX;

  return (
    <div className="flex flex-col gap-6">
      <PlanBuilderControls
        quantity={quantity}
        setQuantity={setQuantity}
        cycle={cycle}
        setCycle={setCycle}
        quantityInputId={quantityInputId}
      />

      <PagePackControls
        packs={packs}
        setPacks={setPacks}
        cycle={cycle}
        quantity={quantity}
        packsInputId={packsInputId}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PUBLIC_TIERS.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            quantity={quantity}
            cycle={cycle}
            packs={packs}
            isSelected={selectedTier === tier.id}
            onSelect={() => setSelectedTier(tier.id)}
            billingBlocked={billingBlocked}
            hasLiveSubscription={hasLiveSubscription}
          />
        ))}
      </div>

      <PartnerCard atOrAboveMax={overMax} billingBlocked={billingBlocked} />

      {hasCustomer && stripeConfigured ? (
        <form action={openBillingPortalSession}>
          <Button type="submit" variant="outline">
            Manage billing &amp; invoices
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function PagePackControls({
  packs,
  setPacks,
  cycle,
  quantity,
  packsInputId,
}: {
  packs: number;
  setPacks: (n: number) => void;
  cycle: "monthly" | "yearly";
  quantity: number;
  packsInputId: string;
}) {
  const unit =
    cycle === "monthly" ? PACK_PRICING.unitMonthlyUsd : PACK_PRICING.unitYearlyUsd;
  const unitSuffix = cycle === "monthly" ? "/mo" : "/yr";
  const bonusPerCommunity = packs * PACK_PRICING.newPagesPerUnit;
  const totalAddOn = packs * quantity * unit;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-card/40 p-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-1 flex-col gap-2">
        <label htmlFor={packsInputId} className="text-sm font-medium text-foreground">
          Need more pages per month? Add Page Packs
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border bg-background p-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Remove one page pack"
              disabled={packs <= 0}
              onClick={() => setPacks(clampPacks(packs - 1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <input
              id={packsInputId}
              type="number"
              inputMode="numeric"
              min={0}
              max={PACK_PRICING.hardMaxPacksPerCommunity}
              value={packs}
              onChange={(e) =>
                setPacks(clampPacks(Number.parseInt(e.target.value, 10)))
              }
              className="w-16 bg-transparent text-center text-sm font-medium tabular-nums outline-none"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Add one page pack"
              disabled={packs >= PACK_PRICING.hardMaxPacksPerCommunity}
              onClick={() => setPacks(clampPacks(packs + 1))}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            +{PACK_PRICING.newPagesPerUnit} new pages / community / month per
            pack · {formatUsd(unit)}
            {unitSuffix} per pack per community
          </p>
        </div>
      </div>
      <div className="text-right text-xs text-muted-foreground sm:max-w-[14rem]">
        {packs > 0 ? (
          <>
            <span className="block tabular-nums">
              +{bonusPerCommunity.toLocaleString()} new pages / community / mo
            </span>
            <span className="block tabular-nums">
              {formatUsd(totalAddOn)}
              {unitSuffix} across {quantity}{" "}
              {quantity === 1 ? "community" : "communities"}
            </span>
          </>
        ) : (
          <span className="block">
            Optional. Stack as many packs as you need; rescans stay free.
          </span>
        )}
      </div>
    </div>
  );
}

function PlanBuilderControls({
  quantity,
  setQuantity,
  cycle,
  setCycle,
  quantityInputId,
}: {
  quantity: number;
  setQuantity: (n: number) => void;
  cycle: "monthly" | "yearly";
  setCycle: (c: "monthly" | "yearly") => void;
  quantityInputId: string;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card/50 p-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-1 flex-col gap-3">
        <label
          htmlFor={quantityInputId}
          className="text-sm font-medium text-foreground"
        >
          How many communities do you need?
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border bg-background p-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Decrease community count"
              disabled={quantity <= COMMUNITY_QUANTITY_HARD_MIN}
              onClick={() => setQuantity(clampQuantity(quantity - 1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <input
              id={quantityInputId}
              type="number"
              inputMode="numeric"
              min={COMMUNITY_QUANTITY_HARD_MIN}
              max={COMMUNITY_QUANTITY_HARD_MAX}
              value={quantity}
              onChange={(e) =>
                setQuantity(clampQuantity(Number.parseInt(e.target.value, 10)))
              }
              className="w-16 bg-transparent text-center text-sm font-medium tabular-nums outline-none"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Increase community count"
              disabled={quantity >= COMMUNITY_QUANTITY_HARD_MAX}
              onClick={() => setQuantity(clampQuantity(quantity + 1))}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {QUICK_PICKS.map((pick) => (
              <Button
                key={pick.count}
                type="button"
                size="sm"
                variant={quantity === pick.count ? "default" : "outline"}
                onClick={() => setQuantity(pick.count)}
              >
                {pick.label}
              </Button>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Pricing scales per community. Rescans of already-tracked pages are
          always free; only adding new pages counts against your monthly
          allowance.
        </p>
      </div>

      <div
        role="group"
        aria-label="Billing cycle"
        className="inline-flex shrink-0 items-center rounded-md border border-border bg-background p-1"
      >
        <Button
          type="button"
          size="sm"
          variant={cycle === "monthly" ? "default" : "ghost"}
          onClick={() => setCycle("monthly")}
        >
          Monthly
        </Button>
        <Button
          type="button"
          size="sm"
          variant={cycle === "yearly" ? "default" : "ghost"}
          onClick={() => setCycle("yearly")}
        >
          Yearly{" "}
          <span className="ml-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-500">
            <Sparkles className="h-3 w-3" /> save 17%
          </span>
        </Button>
      </div>
    </div>
  );
}

function TierCard({
  tier,
  quantity,
  cycle,
  packs,
  isSelected,
  onSelect,
  billingBlocked,
  hasLiveSubscription,
}: {
  tier: PublicTierCard;
  quantity: number;
  cycle: "monthly" | "yearly";
  packs: number;
  isSelected: boolean;
  onSelect: () => void;
  billingBlocked: boolean;
  hasLiveSubscription: boolean;
}) {
  const limits = PLAN_LIMITS_BY_SLUG[tier.monthlyKey];

  const unitPrice =
    cycle === "monthly" ? tier.monthlyUnitUsd : tier.yearlyUnitUsd;
  const unitSuffix = cycle === "monthly" ? "/mo" : "/yr";
  const packUnit =
    cycle === "monthly" ? PACK_PRICING.unitMonthlyUsd : PACK_PRICING.unitYearlyUsd;

  const tierTotal = useMemo(() => unitPrice * quantity, [unitPrice, quantity]);
  const packTotal = useMemo(
    () => packs * quantity * packUnit,
    [packs, quantity, packUnit],
  );
  const total = tierTotal + packTotal;

  const priceKey = cycle === "monthly" ? tier.monthlyKey : tier.yearlyKey;

  const totalScans =
    limits.monthlyScans === null
      ? "Unlimited"
      : (limits.monthlyScans * quantity).toLocaleString();
  const baseNewPages = limits.newPagesPerCommunityMonth ?? null;
  const effectiveNewPages =
    baseNewPages === null
      ? null
      : baseNewPages + packs * PACK_PRICING.newPagesPerUnit;

  return (
    <Card
      role="radio"
      aria-checked={isSelected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex cursor-pointer flex-col transition ${
        isSelected
          ? "border-primary ring-2 ring-primary/30"
          : "hover:border-muted-foreground/40"
      }`}
    >
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

        <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {formatUsd(unitPrice)}
              {unitSuffix} / community
            </span>
            <span className="text-2xl font-semibold tabular-nums">
              {formatUsd(total)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                {unitSuffix}
              </span>
            </span>
          </div>

          <div className="space-y-0.5 text-xs text-muted-foreground">
            <p>
              {quantity} {quantity === 1 ? "community" : "communities"}
              {" · "}
              {totalScans} audit starts / mo (across all communities)
            </p>
            {packs > 0 && effectiveNewPages !== null ? (
              <p>
                <span className="text-foreground">
                  {effectiveNewPages.toLocaleString()} new pages / community / mo
                </span>
                {" "}
                <span>
                  ({baseNewPages?.toLocaleString()} base + {packs} pack{packs === 1 ? "" : "s"}
                  {" "}× {PACK_PRICING.newPagesPerUnit})
                </span>
              </p>
            ) : null}
          </div>

          {hasLiveSubscription ? (
            <form action={openBillingPortalSession}>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="w-full"
                disabled={billingBlocked}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                Manage in Stripe
              </Button>
            </form>
          ) : (
            <form action={startCheckoutSession}>
              <input type="hidden" name="priceKey" value={priceKey} />
              <input type="hidden" name="quantity" value={String(quantity)} />
              <input
                type="hidden"
                name="pagesPackQuantity"
                value={String(packs)}
              />
              <Button
                type="submit"
                size="sm"
                className="w-full"
                disabled={billingBlocked}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                Subscribe {cycle === "monthly" ? "monthly" : "yearly"}
              </Button>
            </form>
          )}
        </div>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        {billingBlocked
          ? "Checkout is temporarily unavailable. Please contact support."
          : hasLiveSubscription
            ? "Change quantity, tier, or Page Packs on your existing subscription \u2014 no duplicate charges."
            : null}
      </CardFooter>
    </Card>
  );
}

function PartnerCard({
  atOrAboveMax,
  billingBlocked,
}: {
  atOrAboveMax: boolean;
  billingBlocked: boolean;
}) {
  return (
    <Card
      className={
        atOrAboveMax
          ? "border-primary/40 bg-primary/5"
          : "border-dashed"
      }
    >
      <CardHeader>
        <CardTitle className="text-base">{PARTNER_PROGRAM.name}</CardTitle>
        <CardDescription>{PARTNER_PROGRAM.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          {atOrAboveMax
            ? `Need more than ${COMMUNITY_QUANTITY_HARD_MAX} communities? Let's talk.`
            : PARTNER_PROGRAM.priceNote}
        </p>
        <span className="max-w-md text-xs text-muted-foreground">
          {billingBlocked
            ? "Billing is temporarily unavailable."
            : "Contact us for Partner pricing."}
        </span>
      </CardContent>
    </Card>
  );
}
