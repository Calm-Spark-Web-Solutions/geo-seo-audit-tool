"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { enqueueAudit } from "@/lib/audit/queue";
import {
  isAuditRunnerConfigured,
  kickAuditRunnerFireAndForget,
} from "@/lib/audit/runner-kick";
import { sameOrigin } from "@/lib/crawler/normalize";
import { consumeRateLimit } from "@/lib/ratelimit";
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

const MAX_PAGES_FLOOR = 1;
const MAX_PAGES_CEILING = 1000;
const DEFAULT_MAX_PAGES = 100;
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
    if (!sameOrigin(websiteUrl, trimmed)) {
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
  const rawMax = formData.get("max_pages");
  let maxPages = DEFAULT_MAX_PAGES;
  if (typeof rawMax === "string" && rawMax.trim() !== "") {
    const parsed = Number.parseInt(rawMax, 10);
    if (!Number.isFinite(parsed)) {
      return { error: "Maximum pages must be a number." };
    }
    if (parsed < MAX_PAGES_FLOOR || parsed > MAX_PAGES_CEILING) {
      return {
        error: `Maximum pages must be between ${MAX_PAGES_FLOOR} and ${MAX_PAGES_CEILING}.`,
      };
    }
    maxPages = parsed;
  }

  const targetParsed = parseSameOriginUrlList(
    formData.getAll("page_urls"),
    websiteUrl,
    "One of the selected URLs is invalid.",
    "Selected URLs must be http(s).",
    "Selected URLs must live on the community’s domain.",
  );
  if ("error" in targetParsed) return targetParsed;

  if (targetParsed.length === 0) {
    return { error: "Select at least one URL to audit." };
  }
  if (targetParsed.length > MAX_PAGES_CEILING) {
    return {
      error: `Too many URLs selected (max ${MAX_PAGES_CEILING}).`,
    };
  }
  if (targetParsed.length > maxPages) {
    return {
      error: `You selected ${targetParsed.length} URLs but the cap is set to ${maxPages}. Lower your selection or raise the cap.`,
    };
  }

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
    redirect(`/audits/${existing.id}?resumed=1`);
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
      error: `Rate limit reached: at most ${RATE_MAX} audits per hour per organization.`,
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
    })
    .select("id")
    .single();

  if (aErr || !audit) {
    return {
      ok: false,
      error: aErr?.message ?? "Could not start audit.",
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
        err instanceof Error
          ? err.message
          : "Could not enqueue audit job.",
    };
  }

  if (!isAuditRunnerConfigured()) {
    return {
      ok: false,
      error:
        "Audit runner is not configured (missing NEXT_PUBLIC_SITE_URL or AUDIT_RUNNER_SECRET).",
    };
  }

  // Fire-and-forget: kick the runner route, then redirect immediately so the
  // user sees live progress on the audit detail page. If the kick is dropped
  // the cron tick will pick the queued job up within ~60 s.
  kickAuditRunnerFireAndForget(audit.id);

  revalidatePath(`/communities/${communityId}`);
  redirect(`/audits/${audit.id}?started=1`);
}
