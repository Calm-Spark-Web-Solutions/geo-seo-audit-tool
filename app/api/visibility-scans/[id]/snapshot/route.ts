import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { Audit, AuditPage, AuditQueueDiagnostics } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Snapshot is a fast read; bound it well below the 300 s default so a stuck
// query doesn't hold a function slot for minutes during a flapping audit.
export const maxDuration = 15;
// Literal required by Next.js's route-segment-config analyzer.
// See lib/config/region.ts for region options.
export const preferredRegion = "iad1";

const AUDIT_PAGES_SELECT_FULL =
  "id, audit_id, url, score, seo_results, geo_results, fixes, manual_notes, ai_comment, exclude_from_audit_score, sitemap_category_label, created_at";

/** DB has migration 017 (exclude) but not yet 021 (sitemap category). */
const AUDIT_PAGES_SELECT_FULL_PRE_CATEGORY =
  "id, audit_id, url, score, seo_results, geo_results, fixes, manual_notes, ai_comment, exclude_from_audit_score, created_at";

const AUDIT_PAGES_SELECT_LEGACY =
  "id, audit_id, url, score, seo_results, geo_results, fixes, manual_notes, ai_comment, created_at";

// Light shape: just enough for the live polling loop to render score + URL
// rows. seo_results / geo_results / fixes / ai_comment are dropped because
// they balloon the per-poll payload to MB-class for large audits.
const AUDIT_PAGES_SELECT_LIGHT =
  "id, url, score, exclude_from_audit_score, sitemap_category_label";

const AUDIT_PAGES_SELECT_LIGHT_PRE_CATEGORY =
  "id, url, score, exclude_from_audit_score";

const AUDIT_PAGES_SELECT_LIGHT_LEGACY = "id, url, score";

const AUDIT_SELECT_FULL =
  "id, community_id, status, score, seo_score, geo_score, pages_crawled, progress_total, site_wide_checks, crux_field_checks, engine_version, created_at";
// Light shape skips the large JSONB columns. They only change at run-start
// (site_wide / crux_field), so the client merges light updates over the
// initial server-rendered audit row.
const AUDIT_SELECT_LIGHT =
  "id, status, score, seo_score, geo_score, pages_crawled, progress_total";

/** PostgREST/Postgres when migration 017 not applied yet on a database. */
function isMissingExcludeColumnError(err: { message?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return (
    m.includes("exclude_from_audit_score") ||
    (m.includes("column") && m.includes("does not exist"))
  );
}

/** PostgREST/Postgres when migration 021 not applied yet. */
function isMissingSitemapCategoryColumnError(err: {
  message?: string;
} | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("sitemap_category_label");
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const isLight = url.searchParams.get("mode") === "light";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: audit, error: auditErr } = await supabase
    .from("audits")
    .select(isLight ? AUDIT_SELECT_LIGHT : AUDIT_SELECT_FULL)
    .eq("id", id)
    .maybeSingle();

  if (auditErr) {
    return NextResponse.json({ error: auditErr.message }, { status: 500 });
  }
  if (!audit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pagesSelect = isLight
    ? AUDIT_PAGES_SELECT_LIGHT
    : AUDIT_PAGES_SELECT_FULL;
  const pagesSelectLegacy = isLight
    ? AUDIT_PAGES_SELECT_LIGHT_LEGACY
    : AUDIT_PAGES_SELECT_LEGACY;
  const pagesSelectPreCategory = isLight
    ? AUDIT_PAGES_SELECT_LIGHT_PRE_CATEGORY
    : AUDIT_PAGES_SELECT_FULL_PRE_CATEGORY;

  const first = await supabase
    .from("audit_pages")
    .select(pagesSelect)
    .eq("audit_id", id)
    .order("score", { ascending: false, nullsFirst: false });

  // Supabase's typed client returns a synthetic `ParserError` row type when
  // the `.select()` argument is a runtime-conditional union of literals
  // (the parser can't statically reduce the string), so we route the cast
  // through `unknown` — exactly what tsc suggests in the error message.
  // The runtime shape is correct: the SQL executes and returns the columns
  // we asked for in either branch.
  let pages: AuditPage[] | null = first.data as unknown as AuditPage[] | null;
  let pagesErr = first.error;

  if (pagesErr && isMissingSitemapCategoryColumnError(pagesErr)) {
    const fallback = await supabase
      .from("audit_pages")
      .select(pagesSelectPreCategory)
      .eq("audit_id", id)
      .order("score", { ascending: false, nullsFirst: false });
    pages = fallback.data as unknown as AuditPage[] | null;
    pagesErr = fallback.error;
  }

  if (pagesErr && isMissingExcludeColumnError(pagesErr)) {
    const fallback = await supabase
      .from("audit_pages")
      .select(pagesSelectLegacy)
      .eq("audit_id", id)
      .order("score", { ascending: false, nullsFirst: false });
    pages = fallback.data as unknown as AuditPage[] | null;
    pagesErr = fallback.error;
  }

  if (pagesErr) {
    return NextResponse.json({ error: pagesErr.message }, { status: 500 });
  }

  const { data: jobRow } = await supabase
    .from("audit_jobs")
    .select("last_error, attempts, max_attempts")
    .eq("audit_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const queue: AuditQueueDiagnostics | null = jobRow
    ? {
        lastError: jobRow.last_error,
        attempts: jobRow.attempts,
        maxAttempts: jobRow.max_attempts,
      }
    : null;

  return NextResponse.json({
    audit: audit as unknown as Audit,
    pages: (pages ?? []) as unknown as AuditPage[],
    queue,
  });
}
