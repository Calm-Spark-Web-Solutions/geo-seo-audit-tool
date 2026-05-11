import { redirect } from "next/navigation";

import { BillingAlert } from "@/components/billing/BillingAlert";
import { PricingCards } from "@/components/billing/PricingCards";
import { ProfileSettingsSection } from "@/components/settings/ProfileSettingsSection";
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
} from "@/lib/billing/plans";
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
    avatar_url?: string | null;
  };
  const profileInitialName =
    meta.full_name ?? meta.name ?? "";
  const profileInitialAvatar = meta.avatar_url ?? "";

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
        title={activeTab === "profile" ? "Profile" : "Settings"}
        description={
          activeTab === "profile"
            ? "Update the name and photo shown in the app."
            : "Manage billing and who can access your organizations."
        }
      />

      <div className="min-w-0 space-y-8">
        {activeTab === "profile" ? (
          <ProfileSettingsSection
            email={user.email ?? ""}
            initialFullName={profileInitialName}
            initialAvatarUrl={profileInitialAvatar}
          />
        ) : activeTab === "billing" ? (
            <>
              <BillingAlert code={billingCode} />

              <Card id="billing">
                <CardHeader>
                  <CardTitle className="text-base">Current plan</CardTitle>
                  <CardDescription>
                    Subscription is tracked per login. With Stripe configured,
                    starting new visibility scans and downloading PDF exports require{" "}
                    <strong className="font-medium text-foreground">
                      Active
                    </strong>{" "}
                    or{" "}
                    <strong className="font-medium text-foreground">
                      Trialing
                    </strong>{" "}
                    status from Checkout.
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
                      Billing is temporarily unavailable. Please contact support.
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <div className="space-y-3">
                <h2 className="text-lg font-semibold tracking-tight">Pricing</h2>
                <p className="text-sm text-muted-foreground">
                  Choose a public tier below, or read about the Partner program
                  for invitation-only pricing.
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
            <div id="organizations">
              <SettingsOrganizationsSection />
            </div>
          )}
      </div>
    </>
  );
}
