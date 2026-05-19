import type { SupabaseClient } from "@supabase/supabase-js";

import { deriveRerunTargetUrls } from "@/lib/audit/derive-rerun-target-urls";
import { enqueueAudit } from "@/lib/audit/queue";
import {
  isAuditRunnerConfigured,
  kickAuditRunnerFireAndForget,
} from "@/lib/audit/runner-kick";
import { userAllowedPaidProductFeatures } from "@/lib/billing/subscription-access";
import { observabilityLog } from "@/lib/observability/log";
import { consumeRateLimit } from "@/lib/ratelimit";
import { isStripeConfigured } from "@/lib/stripe/server";

/** Monthly batch: one rerun per community per hour bucket is enough. */
const MONTHLY_RATE_MAX = 50;
const MONTHLY_RATE_WINDOW_SECONDS = 60 * 60;

export type ScheduleCommunityScanResult =
  | { ok: true; auditId: string }
  | { ok: false; reason: string };

export async function scheduleCommunityScan(
  supabase: SupabaseClient,
  communityId: string,
  source: "monthly",
): Promise<ScheduleCommunityScanResult> {
  const { data: community, error: cErr } = await supabase
    .from("communities")
    .select("id, company_id, website_url")
    .eq("id", communityId)
    .maybeSingle();

  if (cErr || !community) {
    return { ok: false, reason: "community_not_found" };
  }

  const companyId = community.company_id as string;
  const { data: companyRow } = await supabase
    .from("companies")
    .select("user_id")
    .eq("id", companyId)
    .maybeSingle();
  const companyOwnerId = companyRow?.user_id as string | undefined;

  const stripeOn = isStripeConfigured();
  if (
    stripeOn &&
    process.env.ALLOW_AUDITS_WITHOUT_SUBSCRIPTION !== "1" &&
    companyOwnerId
  ) {
    const { data: subRow } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", companyOwnerId)
      .maybeSingle();
    if (!userAllowedPaidProductFeatures(stripeOn, subRow)) {
      return { ok: false, reason: "subscription_inactive" };
    }
  }

  const { data: existing } = await supabase
    .from("audits")
    .select("id")
    .eq("community_id", communityId)
    .in("status", ["pending", "running"])
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return { ok: false, reason: "scan_already_running" };
  }

  const { data: prior } = await supabase
    .from("audits")
    .select("id, community_id, target_urls, shard_urls, max_pages, score")
    .eq("community_id", communityId)
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!prior) {
    return { ok: false, reason: "no_completed_scan" };
  }

  const derived = await deriveRerunTargetUrls(
    supabase,
    community.website_url as string,
    {
      id: prior.id as string,
      community_id: prior.community_id as string,
      target_urls: prior.target_urls,
      shard_urls: prior.shard_urls,
      max_pages: prior.max_pages as number | null,
    },
  );

  if (!derived.ok) {
    observabilityLog.warn("schedule_scan.derive_failed", {
      communityId,
      source,
      error: derived.error,
    });
    return { ok: false, reason: "derive_urls_failed" };
  }

  const allowed = await consumeRateLimit(
    supabase,
    `audit_start:monthly:${companyId}`,
    MONTHLY_RATE_MAX,
    MONTHLY_RATE_WINDOW_SECONDS,
  );
  if (!allowed) {
    return { ok: false, reason: "rate_limited" };
  }

  const shardUrlsForInsert = derived.shardUrlsMeta ?? [];
  const { data: audit, error: aErr } = await supabase
    .from("audits")
    .insert({
      community_id: communityId,
      status: "pending",
      pages_crawled: 0,
      engine_version: 2,
      max_pages: derived.urls.length,
      shard_urls: shardUrlsForInsert.length > 0 ? shardUrlsForInsert : null,
      target_urls: derived.urls,
      consumes_manual_quota: false,
    })
    .select("id")
    .single();

  if (aErr || !audit) {
    return { ok: false, reason: "insert_failed" };
  }

  try {
    await enqueueAudit(supabase, audit.id as string);
  } catch (err) {
    observabilityLog.warn("schedule_scan.enqueue_failed", {
      communityId,
      auditId: audit.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: "enqueue_failed" };
  }

  if (!isAuditRunnerConfigured()) {
    return { ok: false, reason: "runner_not_configured" };
  }

  kickAuditRunnerFireAndForget(audit.id as string);
  observabilityLog.info("schedule_scan.queued", {
    communityId,
    auditId: audit.id,
    source,
  });
  return { ok: true, auditId: audit.id as string };
}
