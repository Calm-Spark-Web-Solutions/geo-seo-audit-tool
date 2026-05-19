import { redirect } from "next/navigation";

import { BillingAlert } from "@/components/billing/BillingAlert";
import { BillingUsageCard } from "@/components/billing/BillingUsageCard";
import { PricingCards } from "@/components/billing/PricingCards";
import { ProfileSettingsSection } from "@/components/settings/ProfileSettingsSection";
import { GoogleIntegrationsLoader } from "@/components/settings/GoogleIntegrationsLoader";
import { SettingsOrganizationsSection } from "@/components/settings/SettingsOrganizationsSection";
import { SettingsTeamInviteSection } from "@/components/teams/SettingsTeamInviteSection";
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
  formatUsd,
  PUBLIC_TIERS,
} from "@/lib/billing/plans";
import {
  PACK_PRICING,
  RUNS_PACK_PRICING,
  resolvePlanLimits,
  monthlyVolumeDiscountedSubtotal,
  TRIAL_PLAN_LIMITS,
} from "@/lib/billing/plan-limits";
import { loadBillingUsageSnapshot } from "@/lib/billing/usage-snapshot";
import { createClient } from "@/lib/supabase/server";
import { isStripeConfigured } from "@/lib/stripe/server";
import type { Subscription } from "@/types";

type SettingsTab = "billing" | "team" | "organizations" | "profile";

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

  const tabRaw = sp.tab;
  const tabParam =
    typeof tabRaw === "string"
      ? tabRaw
      : Array.isArray(tabRaw)
        ? tabRaw[0]
        : undefined;

  const googleRaw = sp.google;
  const googleFlash =
    typeof googleRaw === "string"
      ? googleRaw
      : Array.isArray(googleRaw)
        ? googleRaw[0]
        : undefined;
  const reasonRaw = sp.reason;
  const googleReason =
    typeof reasonRaw === "string"
      ? reasonRaw
      : Array.isArray(reasonRaw)
        ? reasonRaw[0]
        : undefined;
  const activeTab: SettingsTab =
    tabParam === "profile"
      ? "profile"
      : tabParam === "team"
        ? "team"
        : tabParam === "organizations"
          ? "organizations"
          : "billing";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const meta = (user.user_metadata ?? {}) as {
    full_name?: string | null;
    name?: string | null;
  };
  const profileInitialName =
    meta.full_name ?? meta.name ?? "";

  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const subscription = subRow as Subscription | null;
  const stripeConfigured = isStripeConfigured();
  const usageSnapshot = await loadBillingUsageSnapshot(supabase, user.id);

  // Compute the per-community unit price + total for the "Current plan" card
  // so the customer sees exactly what they're paying for. Falls back to a
  // simple plan label when the slug isn't one of the public tiers.
  const planSlug = subscription?.plan ?? null;
  const planLimits =
    subscription?.status === "trialing"
      ? TRIAL_PLAN_LIMITS
      : resolvePlanLimits(planSlug, subscription?.plan_limits ?? null);
  const planTier = PUBLIC_TIERS.find(
    (t) => t.monthlyKey === planSlug || t.yearlyKey === planSlug,
  );
  const planCycle: "monthly" | "yearly" | null = planSlug
    ? planSlug.endsWith("_yearly")
      ? "yearly"
      : "monthly"
    : null;
  const communityCount = planLimits.communities ?? 1;
  const unitPrice =
    planTier && planCycle === "yearly"
      ? planTier.yearlyUnitUsd
      : planTier
        ? planTier.monthlyUnitUsd
        : null;

  // Page Pack bonus = (packs × communities × unitPrice) on top of the tier
  // line. We derive `packs` from the override's bonus knob so it stays a
  // single source of truth.
  const bonusPerCommunity = planLimits.newPagesPackBonusPerMonth ?? 0;
  const packsPerCommunity =
    bonusPerCommunity > 0
      ? Math.floor(bonusPerCommunity / PACK_PRICING.newPagesPerUnit)
      : 0;
  const packUnitPrice =
    planCycle === "yearly"
      ? PACK_PRICING.unitYearlyUsd
      : PACK_PRICING.unitMonthlyUsd;
  const packTotal = packsPerCommunity * communityCount * packUnitPrice;

  const runsBonusPerCommunity = planLimits.monthlyScansPackBonusPerMonth ?? 0;
  const runsPacksPerCommunity =
    runsBonusPerCommunity > 0
      ? Math.floor(runsBonusPerCommunity / RUNS_PACK_PRICING.monthlyScansPerUnit)
      : 0;
  const runsPackUnitPrice =
    planCycle === "yearly"
      ? RUNS_PACK_PRICING.unitYearlyUsd
      : RUNS_PACK_PRICING.unitMonthlyUsd;
  const runsPackTotal =
    runsPacksPerCommunity * communityCount * runsPackUnitPrice;

  const cycleSuffix = planCycle === "yearly" ? "/yr" : "/mo";
  const tierDiscounted =
    planTier && unitPrice !== null
      ? monthlyVolumeDiscountedSubtotal(unitPrice, communityCount)
      : null;
  const tierTotalLine =
    planTier && unitPrice !== null && planCycle && tierDiscounted !== null
      ? `${communityCount.toLocaleString()} ${
          communityCount === 1 ? "community" : "communities"
        } × ${formatUsd(unitPrice)}${cycleSuffix} → ${formatUsd(tierDiscounted)}${cycleSuffix} after volume discount`
      : null;
  const packTotalLine =
    packsPerCommunity > 0 && planCycle
      ? `${packsPerCommunity} page pack${packsPerCommunity === 1 ? "" : "s"} × ${communityCount.toLocaleString()} ${
          communityCount === 1 ? "community" : "communities"
        } × ${formatUsd(packUnitPrice)}${cycleSuffix} = ${formatUsd(packTotal)}${cycleSuffix}`
      : null;
  const grandTotalLine =
    planTier && unitPrice !== null && planCycle && tierDiscounted !== null
      ? `${formatUsd(tierDiscounted + packTotal + runsPackTotal)}${cycleSuffix}`
      : null;

  return (
    <>
      <PageHeader
        title={activeTab === "profile" ? "Profile" : "Settings"}
        description={
          activeTab === "profile"
            ? "Update the name shown in the app."
            : "Manage billing and who can access your organizations."
        }
      />

      <div className="min-w-0 space-y-8">
        {activeTab === "profile" ? (
          <ProfileSettingsSection
            email={user.email ?? ""}
            initialFullName={profileInitialName}
          />
        ) : activeTab === "billing" ? (
            <>
              <BillingAlert
                code={billingCode}
                stripeSubId={subscription?.stripe_sub_id ?? null}
              />

              <Card id="billing">
                <CardHeader>
                  <CardTitle className="text-base">Current plan</CardTitle>
                  <CardDescription>
                    Subscription is tracked per login. With Stripe configured,
                    starting visibility scans requires{" "}
                    <strong className="font-medium text-foreground">
                      Active
                    </strong>{" "}
                    or{" "}
                    <strong className="font-medium text-foreground">
                      Trialing
                    </strong>{" "}
                    status. PDF downloads require{" "}
                    <strong className="font-medium text-foreground">
                      Active
                    </strong>{" "}
                    (trial includes capped scans only).
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
                  {tierTotalLine ? (
                    <p>
                      <span className="text-muted-foreground">Tier: </span>
                      <span className="font-medium tabular-nums">
                        {tierTotalLine}
                      </span>
                    </p>
                  ) : null}
                  {packTotalLine ? (
                    <p>
                      <span className="text-muted-foreground">
                        Page Packs:{" "}
                      </span>
                      <span className="font-medium tabular-nums">
                        {packTotalLine}
                      </span>
                    </p>
                  ) : null}
                  {grandTotalLine ? (
                    <p>
                      <span className="text-muted-foreground">Total: </span>
                      <span className="font-semibold tabular-nums">
                        {grandTotalLine}
                      </span>
                    </p>
                  ) : null}
                  {!stripeConfigured ? (
                    <p className="pt-2 text-muted-foreground">
                      Billing is temporarily unavailable. Please contact support.
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <BillingUsageCard snapshot={usageSnapshot} />

              <div className="space-y-3">
                <h2 className="text-lg font-semibold tracking-tight">
                  Build your plan
                </h2>
                <p className="text-sm text-muted-foreground">
                  Pick the number of communities you need, choose a per-community
                  tier, and switch between monthly and yearly billing. The
                  Partner program covers organizations larger than this builder
                  supports.
                </p>
                <PricingCards
                  subscription={subscription}
                  stripeConfigured={stripeConfigured}
                />
              </div>
            </>
          ) : activeTab === "team" ? (
            <div id="team-invite">
              <SettingsTeamInviteSection />
            </div>
          ) : (
            <div id="organizations" className="space-y-6">
              <GoogleIntegrationsLoader
                googleFlash={googleFlash}
                googleReason={googleReason}
              />
              <SettingsOrganizationsSection />
            </div>
          )}
      </div>
    </>
  );
}
