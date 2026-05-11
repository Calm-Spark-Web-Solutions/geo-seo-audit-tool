"use server";

import { revalidatePath } from "next/cache";

import { recalculateAuditRollupScores } from "@/lib/audit/rollup-scores";
import {
  mergeFixesFromAllChecks,
  overallPageScoreFromChecks,
} from "@/lib/scoring/effective-scores";
import { createClient } from "@/lib/supabase/server";
import type { AuditCheck } from "@/types";

async function revalidateAuditPaths(
  supabase: Awaited<ReturnType<typeof createClient>>,
  auditId: string,
  pageId: string,
) {
  revalidatePath(`/visibility-scans/${auditId}`);
  revalidatePath(`/visibility-scans/${auditId}/pages/${pageId}`);
  const { data: row } = await supabase
    .from("audits")
    .select("community_id")
    .eq("id", auditId)
    .maybeSingle();
  const cid = row?.community_id as string | undefined;
  if (cid) revalidatePath(`/communities/${cid}`);
}

export type ScoreActionResult = { ok: boolean; error?: string };

export async function setAuditPageExcludeFromRollup(
  auditId: string,
  pageId: string,
  excluded: boolean,
): Promise<ScoreActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { error } = await supabase
    .from("audit_pages")
    .update({ exclude_from_audit_score: excluded })
    .eq("id", pageId)
    .eq("audit_id", auditId);

  if (error) return { ok: false, error: error.message };

  await recalculateAuditRollupScores(supabase, auditId);
  await revalidateAuditPaths(supabase, auditId, pageId);
  return { ok: true };
}

export async function setAuditCheckExcludeFromScore(
  auditId: string,
  pageId: string,
  pillar: "seo" | "geo",
  checkKey: string,
  excluded: boolean,
): Promise<ScoreActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: row, error: readErr } = await supabase
    .from("audit_pages")
    .select("seo_results, geo_results")
    .eq("id", pageId)
    .eq("audit_id", auditId)
    .maybeSingle();

  if (readErr || !row) {
    return { ok: false, error: readErr?.message ?? "Page not found." };
  }

  const seo = [...((row.seo_results ?? []) as AuditCheck[])];
  const geo = [...((row.geo_results ?? []) as AuditCheck[])];
  const target = pillar === "seo" ? seo : geo;
  const idx = target.findIndex((c) => c.key === checkKey);
  if (idx === -1) return { ok: false, error: "Check not found." };

  const next = { ...target[idx]! };
  if (excluded) next.excludeFromScore = true;
  else delete next.excludeFromScore;
  target[idx] = next;

  const seoFinal = pillar === "seo" ? target : seo;
  const geoFinal = pillar === "geo" ? target : geo;

  const score = overallPageScoreFromChecks(seoFinal, geoFinal);
  const fixes = mergeFixesFromAllChecks(seoFinal, geoFinal);

  const { error: upErr } = await supabase
    .from("audit_pages")
    .update({
      seo_results: seoFinal,
      geo_results: geoFinal,
      score,
      fixes,
    })
    .eq("id", pageId)
    .eq("audit_id", auditId);

  if (upErr) return { ok: false, error: upErr.message };

  await recalculateAuditRollupScores(supabase, auditId);
  await revalidateAuditPaths(supabase, auditId, pageId);
  return { ok: true };
}

/**
 * Apply per-check score inclusion for both pillars in one write (per-URL page).
 * `excludedByKey` maps check `key` → whether that check is omitted from the page average.
 */
export async function saveAuditPageScoreExclusions(
  auditId: string,
  pageId: string,
  excludedByKey: { seo: Record<string, boolean>; geo: Record<string, boolean> },
): Promise<ScoreActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: row, error: readErr } = await supabase
    .from("audit_pages")
    .select("seo_results, geo_results")
    .eq("id", pageId)
    .eq("audit_id", auditId)
    .maybeSingle();

  if (readErr || !row) {
    return { ok: false, error: readErr?.message ?? "Page not found." };
  }

  const applyPillar = (
    checks: AuditCheck[],
    excludedMap: Record<string, boolean>,
  ): AuditCheck[] => {
    return checks.map((c) => {
      const excluded = excludedMap[c.key] === true;
      if (!excluded) {
        const next = { ...c };
        delete next.excludeFromScore;
        return next;
      }
      return { ...c, excludeFromScore: true };
    });
  };

  const seoFinal = applyPillar(
    [...((row.seo_results ?? []) as AuditCheck[])],
    excludedByKey.seo,
  );
  const geoFinal = applyPillar(
    [...((row.geo_results ?? []) as AuditCheck[])],
    excludedByKey.geo,
  );

  const score = overallPageScoreFromChecks(seoFinal, geoFinal);
  const fixes = mergeFixesFromAllChecks(seoFinal, geoFinal);

  const { error: upErr } = await supabase
    .from("audit_pages")
    .update({
      seo_results: seoFinal,
      geo_results: geoFinal,
      score,
      fixes,
    })
    .eq("id", pageId)
    .eq("audit_id", auditId);

  if (upErr) return { ok: false, error: upErr.message };

  await recalculateAuditRollupScores(supabase, auditId);
  await revalidateAuditPaths(supabase, auditId, pageId);
  return { ok: true };
}
