import type { SupabaseClient } from "@supabase/supabase-js";

import { recalculateAuditRollupScores } from "@/lib/audit/rollup-scores";
import { tryFetchPageWithMeta } from "@/lib/crawler/fetch";
import { PAGE_FETCH_TIMEOUT_MS } from "@/lib/crawler/fetch-pages";
import {
  DEFAULT_USER_AGENT,
  normalizeUrl,
  preferTrailingSlashFetchUrl,
  sameAuditSiteOrigin,
} from "@/lib/crawler/normalize";
import {
  mergeFixesFromAllChecks,
  overallPageScoreFromChecks,
} from "@/lib/scoring/effective-scores";
import { runPsi } from "@/lib/scoring/psi";
import { scoreAndAnalyzePage } from "@/lib/scoring";
import type { AuditCheck } from "@/types";

export type RefreshAuditPageMode = "psi" | "full";

export type RefreshAuditPageLibResult =
  | { ok: true; mode: RefreshAuditPageMode }
  | {
      ok: false;
      code:
        | "not_found"
        | "forbidden_origin"
        | "no_psi_key"
        | "no_psi_data"
        | "fetch_failed"
        | "persist_failed";
      message: string;
    };

/** Strip PageSpeed / Lighthouse-derived checks (keys prefixed `psi_`). */
export function stripPsiChecks(checks: AuditCheck[]): AuditCheck[] {
  return checks.filter((c) => !c.key.startsWith("psi_"));
}

/**
 * Replace stored PSI rows with a fresh `runPsi` result while keeping
 * deterministic, AI, and other non-PSI checks intact.
 */
export function mergePsiBucketsIntoStoredChecks(
  seo: AuditCheck[],
  geo: AuditCheck[],
  psi: { seo: AuditCheck[]; geo: AuditCheck[] },
): { seo: AuditCheck[]; geo: AuditCheck[] } {
  return {
    seo: [...stripPsiChecks(seo), ...psi.seo],
    geo: [...stripPsiChecks(geo), ...psi.geo],
  };
}

export function buildPageUpdateAfterPsiMerge(
  seo: AuditCheck[],
  geo: AuditCheck[],
  psi: { seo: AuditCheck[]; geo: AuditCheck[] },
): {
  seo_results: AuditCheck[];
  geo_results: AuditCheck[];
  fixes: ReturnType<typeof mergeFixesFromAllChecks>;
  score: number | null;
} {
  const { seo: seoNext, geo: geoNext } = mergePsiBucketsIntoStoredChecks(
    seo,
    geo,
    psi,
  );
  const fixes = mergeFixesFromAllChecks(seoNext, geoNext);
  const score = overallPageScoreFromChecks(seoNext, geoNext);
  return {
    seo_results: seoNext,
    geo_results: geoNext,
    fixes,
    score,
  };
}

function psiBucketTotal(psi: { seo: AuditCheck[]; geo: AuditCheck[] }): number {
  return psi.seo.length + psi.geo.length;
}

async function loadPageCommunityContext(
  supabase: SupabaseClient,
  auditId: string,
  pageId: string,
): Promise<
  | {
      pageUrl: string;
      seo: AuditCheck[];
      geo: AuditCheck[];
      manualNotes: string | null;
      excludeFromAuditScore: boolean;
      sitemapCategoryLabel: string | null;
    }
  | { error: RefreshAuditPageLibResult }
> {
  const { data: page, error: pageErr } = await supabase
    .from("audit_pages")
    .select(
      "id, url, seo_results, geo_results, manual_notes, exclude_from_audit_score, sitemap_category_label",
    )
    .eq("id", pageId)
    .eq("audit_id", auditId)
    .maybeSingle();

  if (pageErr || !page) {
    return {
      error: {
        ok: false,
        code: "not_found",
        message: "Page not found or you do not have access.",
      },
    };
  }

  const { data: audit, error: auditErr } = await supabase
    .from("audits")
    .select("community_id")
    .eq("id", auditId)
    .maybeSingle();

  if (auditErr || !audit?.community_id) {
    return {
      error: {
        ok: false,
        code: "not_found",
        message: "Audit not found or you do not have access.",
      },
    };
  }

  const { data: community, error: commErr } = await supabase
    .from("communities")
    .select("website_url")
    .eq("id", audit.community_id)
    .maybeSingle();

  if (commErr || !community?.website_url) {
    return {
      error: {
        ok: false,
        code: "not_found",
        message: "Community website not found.",
      },
    };
  }

  const base = normalizeUrl(community.website_url);
  const pageUrlNorm = normalizeUrl(page.url as string);
  if (
    !base ||
    !pageUrlNorm ||
    !sameAuditSiteOrigin(base, pageUrlNorm) ||
    !sameAuditSiteOrigin(base, page.url as string)
  ) {
    return {
      error: {
        ok: false,
        code: "forbidden_origin",
        message: "This page URL is not on the audited site origin.",
      },
    };
  }

  return {
    pageUrl: page.url as string,
    seo: ((page.seo_results ?? []) as AuditCheck[]) ?? [],
    geo: ((page.geo_results ?? []) as AuditCheck[]) ?? [],
    manualNotes: (page.manual_notes as string | null) ?? null,
    excludeFromAuditScore: Boolean(page.exclude_from_audit_score),
    sitemapCategoryLabel:
      (page.sitemap_category_label as string | null | undefined) ?? null,
  };
}

/**
 * Re-fetch PageSpeed / Lighthouse for one stored audit page and merge into
 * `seo_results` / `geo_results`, then recompute fixes, score, and audit rollup.
 */
export async function refreshAuditPagePsi(
  supabase: SupabaseClient,
  auditId: string,
  pageId: string,
): Promise<RefreshAuditPageLibResult> {
  if (!process.env.PSI_API_KEY?.trim()) {
    return {
      ok: false,
      code: "no_psi_key",
      message:
        "PageSpeed Insights is not configured (missing PSI API key). Contact support or your administrator.",
    };
  }

  const loaded = await loadPageCommunityContext(supabase, auditId, pageId);
  if ("error" in loaded) return loaded.error;

  const psi = await runPsi(loaded.pageUrl);
  if (psiBucketTotal(psi) === 0) {
    return {
      ok: false,
      code: "no_psi_data",
      message:
        "PageSpeed did not return Lighthouse category data for this URL. Try again later, or use “Re-analyze entire page” if the problem persists.",
    };
  }

  const { seo_results, geo_results, fixes, score } = buildPageUpdateAfterPsiMerge(
    loaded.seo,
    loaded.geo,
    psi,
  );

  const { error: upErr } = await supabase
    .from("audit_pages")
    .update({
      seo_results,
      geo_results,
      fixes,
      score,
    })
    .eq("id", pageId)
    .eq("audit_id", auditId);

  if (upErr) {
    return {
      ok: false,
      code: "persist_failed",
      message: upErr.message,
    };
  }

  await recalculateAuditRollupScores(supabase, auditId);
  return { ok: true, mode: "psi" };
}

/**
 * Full re-analysis: fresh HTML fetch + deterministic + PSI + Anthropic +
 * internal-link probe. Preserves manual notes, rollup exclusion flag, and
 * sitemap category label from the existing row.
 */
export async function refreshAuditPageFull(
  supabase: SupabaseClient,
  auditId: string,
  pageId: string,
): Promise<RefreshAuditPageLibResult> {
  const loaded = await loadPageCommunityContext(supabase, auditId, pageId);
  if ("error" in loaded) return loaded.error;

  const outcome = await tryFetchPageWithMeta(
    preferTrailingSlashFetchUrl(loaded.pageUrl),
    {
      timeoutMs: PAGE_FETCH_TIMEOUT_MS,
      userAgent: DEFAULT_USER_AGENT,
    },
  );

  if (!outcome.ok) {
    return {
      ok: false,
      code: "fetch_failed",
      message: "Could not fetch this page’s HTML. The site may be down or blocking our crawler.",
    };
  }

  const scored = await scoreAndAnalyzePage({
    url: loaded.pageUrl,
    html: outcome.html,
    fetchMeta: outcome.meta,
  });

  const effectiveScore =
    overallPageScoreFromChecks(scored.seoChecks, scored.geoChecks) ??
    scored.score;

  const { error: upErr } = await supabase
    .from("audit_pages")
    .update({
      score: effectiveScore,
      seo_results: scored.seoChecks,
      geo_results: scored.geoChecks,
      fixes: scored.fixes,
      ai_comment: scored.aiComment,
      manual_notes: loaded.manualNotes,
      exclude_from_audit_score: loaded.excludeFromAuditScore,
      sitemap_category_label: loaded.sitemapCategoryLabel,
    })
    .eq("id", pageId)
    .eq("audit_id", auditId);

  if (upErr) {
    return {
      ok: false,
      code: "persist_failed",
      message: upErr.message,
    };
  }

  await recalculateAuditRollupScores(supabase, auditId);
  return { ok: true, mode: "full" };
}

export async function refreshAuditPage(
  supabase: SupabaseClient,
  opts: {
    auditId: string;
    pageId: string;
    mode: RefreshAuditPageMode;
  },
): Promise<RefreshAuditPageLibResult> {
  if (opts.mode === "full") {
    return refreshAuditPageFull(supabase, opts.auditId, opts.pageId);
  }
  return refreshAuditPagePsi(supabase, opts.auditId, opts.pageId);
}
