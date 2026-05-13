import Link from "next/link";
import { notFound } from "next/navigation";
import { Gauge } from "lucide-react";

import {
  StartAuditForm,
  type PageRosterPreview,
  type ShardOption,
} from "@/components/audits/StartAuditForm";
import { InlineErrorCard } from "@/components/layout/InlineErrorCard";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loadBillingContext } from "@/lib/billing/billing-context";
import { loadNewPagesAllowance } from "@/lib/billing/page-quota";
import { userAllowedPaidProductFeatures } from "@/lib/billing/subscription-access";
import { fetchSitemapShards } from "@/lib/crawler/sitemap";
import { createClient } from "@/lib/supabase/server";
import { isStripeConfigured } from "@/lib/stripe/server";
import type { Community } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Hard ceiling on how many URLs we materialize per shard for the picker.
// Matches the audit hard cap (1000) so anything past this couldn't have
// been audited in a single run anyway.
const URL_PREVIEW_LIMIT = 1000;

export default async function NewAuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const stripeOn = isStripeConfigured();
  let paidAccess = true;
  if (user && stripeOn) {
    const { data: subRow } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();
    paidAccess = userAllowedPaidProductFeatures(stripeOn, subRow);
  }

  const { data: community, error } = await supabase
    .from("communities")
    .select("id, company_id, name, website_url, facility_type, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <InlineErrorCard
        title="Could not load community"
        description={error.message}
      />
    );
  }

  if (!community) notFound();

  const typed = community as Community;

  // Probe sitemap shards server-side so the picker renders immediately on
  // first paint. Tight timeout — if the site is slow we still render the
  // form (just without shard checkboxes) and the runner falls back to the
  // legacy sitemap-then-crawl path.
  const rawShards = await fetchSitemapShards(typed.website_url, {
    timeoutMs: 6_000,
  }).catch(() => []);

  const shards: ShardOption[] = rawShards.map((s) => {
    const visibleUrls = s.urls.slice(0, URL_PREVIEW_LIMIT);
    return {
      url: s.url,
      label: s.label,
      urlCount: visibleUrls.length,
      totalCount: s.urlCount,
      defaultChecked: s.defaultChecked,
      urls: visibleUrls,
    };
  });

  // Page roster preview so the form can show "X new vs Y rescans" and a
  // hard stop when the user's selection would bust the new-page cap.
  let pageRoster: PageRosterPreview | undefined;
  if (user) {
    const billingCtx = await loadBillingContext(supabase, user.id);
    if (billingCtx.unlimited) {
      pageRoster = {
        trackedUrls: [],
        newMonthlyCap: null,
        rosterCap: null,
        rosterUsed: 0,
        newAddedThisMonth: 0,
        unlimited: true,
      };
    } else {
      const { data: rosterRows } = await supabase
        .from("community_page_roster")
        .select("url")
        .eq("community_id", typed.id);
      const allowance = await loadNewPagesAllowance(supabase, {
        communityId: typed.id,
        limits: billingCtx.limits,
      });
      pageRoster = {
        trackedUrls: (rosterRows ?? []).map((r) => r.url as string),
        newMonthlyCap: allowance.monthlyNewCap,
        rosterCap: allowance.rosterCap,
        rosterUsed: allowance.rosterUsed,
        newAddedThisMonth: allowance.newAddedThisMonth,
        unlimited: false,
      };
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={`/communities/${typed.id}`}
            className="hover:underline"
          >
            {typed.name}
          </Link>
        }
        title="Run new visibility scan"
        description={
          <span className="text-muted-foreground">
            Pick which sitemap categories and URLs to include. Each page is
            scored with deterministic checks plus PSI and Anthropic
            commentary, so larger runs take proportionally longer.
          </span>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <Gauge className="mt-1 h-5 w-5 text-muted-foreground" aria-hidden />
            <div>
              <CardTitle className="text-base">Confirm</CardTitle>
              <CardDescription className="pt-1">
                Target site:{" "}
                <a
                  href={typed.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-foreground hover:underline"
                >
                  {typed.website_url}
                </a>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <StartAuditForm
            communityId={typed.id}
            shards={shards}
            stripeBillingEnabled={stripeOn}
            paidAccess={paidAccess}
            pageRoster={pageRoster}
          />
        </CardContent>
      </Card>
    </>
  );
}
