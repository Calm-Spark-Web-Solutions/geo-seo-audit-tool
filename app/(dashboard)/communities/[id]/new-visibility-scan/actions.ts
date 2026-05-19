"use server";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { deriveRerunTargetUrls } from "@/lib/audit/derive-rerun-target-urls";
import { enqueueAudit } from "@/lib/audit/queue";
import {
  isAuditRunnerConfigured,
  kickAuditRunnerFireAndForget,
} from "@/lib/audit/runner-kick";
import {
  getAuditQuotaSnapshot,
  quotaAllowsNewAudit,
} from "@/lib/billing/audit-quota";
import { loadBillingContext } from "@/lib/billing/billing-context";
import {
  classifyScanUrls,
  enforceNewPagesAllowance,
  loadNewPagesAllowance,
} from "@/lib/billing/page-quota";
import { userAllowedPaidProductFeatures } from "@/lib/billing/subscription-access";
import { sameAuditSiteOrigin } from "@/lib/crawler/normalize";
import { consumeRateLimit } from "@/lib/ratelimit";
import { isStripeConfigured } from "@/lib/stripe/server";
import { createClient } from "@/lib/supabase/server";

export type StartAuditFormState = {
  ok: boolean;
  error?: string;
};

/** 100 audit starts per company per hour. Bumped from 10 so dev testing
 * doesn't blow the cap on a normal afternoon. Still bounds PSI / Anthropic
 * spend under spam. The window resets the first call after the hour
 * elapses (sliding-window first-touch, see migration 009). */
const RATE_MAX = 100;
const RATE_WINDOW_SECONDS = 60 * 60;

const MAX_PAGES_CEILING = 1000;
// Hard cap on shards-with-selection we accept (analytics metadata only).
// The picker is a checkbox list so this is a sanity stop against
// hand-crafted submissions.
const MAX_SHARD_URLS = 50;

interface ParsedSelection {
  maxPages: number;
  /** Explicit page-URL allowlist the user ticked on the form. */
  targetUrls: string[];
  /** Shards that contributed at least one selected URL (analytics-only). */
  shardUrls: string[];
}

function parseSameOriginUrlList(
  raw: FormDataEntryValue[],
  websiteUrl: string,
  invalidMessage: string,
  protocolMessage: string,
  originMessage: string,
): string[] | { error: string } {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
    } catch {
      return { error: invalidMessage };
    }
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return { error: protocolMessage };
    }
    if (!sameAuditSiteOrigin(websiteUrl, trimmed)) {
      return { error: originMessage };
    }
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function parseSelection(
  formData: FormData,
  websiteUrl: string,
): ParsedSelection | { error: string } {
  const targetParsed = parseSameOriginUrlList(
    formData.getAll("page_urls"),
    websiteUrl,
    "One of the selected URLs is invalid.",
    "Selected URLs must be http(s).",
    "Selected URLs must live on the community’s domain.",
  );
  if ("error" in targetParsed) return targetParsed;

  if (targetParsed.length === 0) {
    return { error: "Select at least one URL to scan." };
  }
  if (targetParsed.length > MAX_PAGES_CEILING) {
    return {
      error: `Too many URLs selected (max ${MAX_PAGES_CEILING}).`,
    };
  }

  const maxPages = targetParsed.length;

  const shardParsed = parseSameOriginUrlList(
    formData.getAll("shard_urls"),
    websiteUrl,
    "One of the selected categories has an invalid URL.",
    "Selected categories must be http(s) URLs.",
    "Selected categories must live on the community’s domain.",
  );
  if ("error" in shardParsed) return shardParsed;
  if (shardParsed.length > MAX_SHARD_URLS) {
    return { error: `Too many categories selected (max ${MAX_SHARD_URLS}).` };
  }

  return {
    maxPages,
    targetUrls: targetParsed,
    shardUrls: shardParsed,
  };
}

async function commitAuditAfterParsed(
  supabase: SupabaseClient,
  user: User,
  communityId: string,
  community: { company_id: string; website_url: string },
  parsed: ParsedSelection,
): Promise<StartAuditFormState> {
  const classified = await classifyScanUrls(supabase, {
    communityId: communityId,
    urls: parsed.targetUrls,
  });
  const consumesManualQuota = classified.newUrls.length > 0;

  if (consumesManualQuota) {
    const quotaSnapshot = await getAuditQuotaSnapshot(supabase, user.id);
    if (!quotaAllowsNewAudit(quotaSnapshot)) {
      return {
        ok: false,
        error:
          "Monthly scan limit reached for your plan. It resets next month, or upgrade in Billing for more scans.",
      };
    }
  }

  // Page-roster billing gate. Rescans of URLs already in the roster are
  // always free; new URLs eat the monthly new-page allowance and the
  // total roster cap (see `community_page_roster` + `lib/billing/page-quota.ts`).
  const billingCtx = await loadBillingContext(supabase, user.id);
  if (!billingCtx.unlimited) {
    const allowance = await loadNewPagesAllowance(supabase, {
      communityId: communityId,
      limits: billingCtx.limits,
    });
    const decision = enforceNewPagesAllowance({
      classified,
      allowance,
    });
    if (!decision.ok) {
      return { ok: false, error: decision.message };
    }
    if (decision.trimmedNewUrls.length > 0) {
      return {
        ok: false,
        error: `Selected URL list exceeds your remaining new-page allowance for this community. You can keep ${decision.acceptedUrls.length} URL${decision.acceptedUrls.length === 1 ? "" : "s"} (${decision.acceptedNewUrls.length} new, ${classified.tracked.length} tracked rescan${classified.tracked.length === 1 ? "" : "s"}); remove ${decision.trimmedNewUrls.length} new URL${decision.trimmedNewUrls.length === 1 ? "" : "s"} or upgrade your plan.`,
      };
    }
  }

  // Idempotency: if there is already a pending or running audit for this
  // community, surface it instead of inserting a duplicate. The unique
  // partial index on `audit_jobs(audit_id) where status in
  // ('queued','running')` is the second line of defence; this check keeps
  // the user from seeing a hard error on a normal double click.
  const { data: existing } = await supabase
    .from("audits")
    .select("id, status")
    .eq("community_id", communityId)
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    redirect(`/visibility-scans/${existing.id}?resumed=1`);
  }

  // Per-company rate limit. Keyed by company so members on the same
  // organization share the cap and a single noisy member can't exhaust
  // PSI / Anthropic budget for the team.
  const allowed = await consumeRateLimit(
    supabase,
    `audit_start:${community.company_id}`,
    RATE_MAX,
    RATE_WINDOW_SECONDS,
  );
  if (!allowed) {
    return {
      ok: false,
      error: `Rate limit reached: at most ${RATE_MAX} visibility scans per hour per organization.`,
    };
  }

  const { data: audit, error: aErr } = await supabase
    .from("audits")
    .insert({
      community_id: communityId,
      status: "pending",
      pages_crawled: 0,
      engine_version: 2,
      max_pages: parsed.maxPages,
      shard_urls: parsed.shardUrls.length > 0 ? parsed.shardUrls : null,
      target_urls: parsed.targetUrls,
      consumes_manual_quota: consumesManualQuota,
    })
    .select("id")
    .single();

  if (aErr || !audit) {
    return {
      ok: false,
      error: aErr?.message ?? "Could not start visibility scan.",
    };
  }

  // Enqueue before kicking the runner so the cron-tick reaper has a row to
  // pick up if the manual kick fails. The unique partial index makes this
  // idempotent if the action is somehow double-submitted.
  try {
    await enqueueAudit(supabase, audit.id);
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Could not enqueue scan job.",
    };
  }

  if (!isAuditRunnerConfigured()) {
    return {
      ok: false,
      error: "Scan runner is not configured. Please contact support.",
    };
  }

  // Fire-and-forget: kick the runner route, then redirect immediately so the
  // user sees live progress on the audit detail page. If the kick is dropped
  // the cron tick will pick the queued job up within ~60 s.
  kickAuditRunnerFireAndForget(audit.id);

  revalidatePath(`/communities/${communityId}`);
  redirect(`/visibility-scans/${audit.id}?started=1`);
}

export async function startAudit(
  _prev: StartAuditFormState,
  formData: FormData,
): Promise<StartAuditFormState> {
  const communityId = formData.get("community_id");
  if (typeof communityId !== "string" || !communityId) {
    return { ok: false, error: "Missing community." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const stripeOn = isStripeConfigured();
  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!userAllowedPaidProductFeatures(stripeOn, subRow)) {
    return {
      ok: false,
      error:
        "An active subscription is required to run visibility scans. Open Settings to choose a plan.",
    };
  }

  const { data: community, error: cErr } = await supabase
    .from("communities")
    .select("id, company_id, website_url")
    .eq("id", communityId)
    .maybeSingle();

  if (cErr || !community) {
    return {
      ok: false,
      error: "Community not found or you don’t have access.",
    };
  }

  const parsed = parseSelection(formData, community.website_url);
  if ("error" in parsed) {
    return { ok: false, error: parsed.error };
  }

  return commitAuditAfterParsed(supabase, user, communityId, community, parsed);
}

export async function rerunVisibilityScan(
  _prev: StartAuditFormState,
  formData: FormData,
): Promise<StartAuditFormState> {
  const communityId = formData.get("community_id");
  const sourceAuditId = formData.get("source_audit_id");
  if (typeof communityId !== "string" || !communityId) {
    return { ok: false, error: "Missing community." };
  }
  if (typeof sourceAuditId !== "string" || !sourceAuditId) {
    return { ok: false, error: "Missing source scan." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const stripeOn = isStripeConfigured();
  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!userAllowedPaidProductFeatures(stripeOn, subRow)) {
    return {
      ok: false,
      error:
        "An active subscription is required to run visibility scans. Open Settings to choose a plan.",
    };
  }

  const { data: community, error: cErr } = await supabase
    .from("communities")
    .select("id, company_id, website_url")
    .eq("id", communityId)
    .maybeSingle();

  if (cErr || !community) {
    return {
      ok: false,
      error: "Community not found or you don’t have access.",
    };
  }

  const { data: prior, error: pErr } = await supabase
    .from("audits")
    .select("id, community_id, target_urls, shard_urls, max_pages")
    .eq("id", sourceAuditId)
    .maybeSingle();

  if (pErr || !prior) {
    return { ok: false, error: "That visibility scan was not found." };
  }
  if (prior.community_id !== communityId) {
    return {
      ok: false,
      error: "That scan does not belong to this community.",
    };
  }

  const derived = await deriveRerunTargetUrls(supabase, community.website_url, {
    id: prior.id,
    community_id: prior.community_id,
    target_urls: prior.target_urls,
    shard_urls: prior.shard_urls,
    max_pages: prior.max_pages,
  });

  if (!derived.ok) {
    return { ok: false, error: derived.error };
  }

  const shardUrlsForInsert = derived.shardUrlsMeta ?? [];

  const parsed: ParsedSelection = {
    maxPages: derived.urls.length,
    targetUrls: derived.urls,
    shardUrls: shardUrlsForInsert,
  };

  return commitAuditAfterParsed(supabase, user, communityId, community, parsed);
}

function parseFetchFailureUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const url = (row as { url?: unknown }).url;
    if (typeof url !== "string") continue;
    const t = url.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Rerun only URLs that failed HTML fetch on a prior partial scan. */
export async function retryFailedPagesScan(
  _prev: StartAuditFormState,
  formData: FormData,
): Promise<StartAuditFormState> {
  const communityId = formData.get("community_id");
  const sourceAuditId = formData.get("source_audit_id");
  if (typeof communityId !== "string" || !communityId) {
    return { ok: false, error: "Missing community." };
  }
  if (typeof sourceAuditId !== "string" || !sourceAuditId) {
    return { ok: false, error: "Missing source scan." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const stripeOn = isStripeConfigured();
  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!userAllowedPaidProductFeatures(stripeOn, subRow)) {
    return {
      ok: false,
      error:
        "An active subscription is required to run visibility scans. Open Settings to choose a plan.",
    };
  }

  const { data: community, error: cErr } = await supabase
    .from("communities")
    .select("id, company_id, website_url")
    .eq("id", communityId)
    .maybeSingle();

  if (cErr || !community) {
    return {
      ok: false,
      error: "Community not found or you don’t have access.",
    };
  }

  const { data: prior, error: pErr } = await supabase
    .from("audits")
    .select("id, community_id, fetch_failures, shard_urls, max_pages, status")
    .eq("id", sourceAuditId)
    .maybeSingle();

  if (pErr || !prior) {
    return { ok: false, error: "That visibility scan was not found." };
  }
  if (prior.community_id !== communityId) {
    return {
      ok: false,
      error: "That scan does not belong to this community.",
    };
  }
  if (prior.status !== "complete") {
    return {
      ok: false,
      error: "Retry failed pages is only available on completed scans.",
    };
  }

  const failedUrls = parseFetchFailureUrls(prior.fetch_failures);
  if (failedUrls.length === 0) {
    return {
      ok: false,
      error: "This scan has no recorded fetch failures to retry.",
    };
  }

  const normalized = parseSameOriginUrlList(
    failedUrls,
    community.website_url,
    "A failed URL from the prior scan is invalid.",
    "Failed URLs must be http(s).",
    "Failed URLs must live on the community’s domain.",
  );
  if ("error" in normalized) {
    return { ok: false, error: normalized.error };
  }

  const cap =
    typeof prior.max_pages === "number" && prior.max_pages > 0
      ? Math.min(prior.max_pages, MAX_PAGES_CEILING)
      : normalized.length;

  const targetUrls = normalized.slice(0, cap);
  const shardMeta = Array.isArray(prior.shard_urls)
    ? prior.shard_urls
        .filter((u): u is string => typeof u === "string")
        .slice(0, MAX_SHARD_URLS)
    : [];

  const parsed: ParsedSelection = {
    maxPages: targetUrls.length,
    targetUrls,
    shardUrls: shardMeta,
  };

  return commitAuditAfterParsed(supabase, user, communityId, community, parsed);
}
