import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { Audit, AuditPage } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: audit, error: auditErr }, { data: pages, error: pagesErr }] =
    await Promise.all([
      supabase
        .from("audits")
        .select(
          "id, community_id, status, score, seo_score, geo_score, pages_crawled, progress_total, created_at",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("audit_pages")
        .select(
          "id, audit_id, url, score, seo_results, geo_results, fixes, manual_notes, ai_comment, created_at",
        )
        .eq("audit_id", id)
        .order("score", { ascending: false, nullsFirst: false }),
    ]);

  if (auditErr) {
    return NextResponse.json({ error: auditErr.message }, { status: 500 });
  }
  if (!audit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (pagesErr) {
    return NextResponse.json({ error: pagesErr.message }, { status: 500 });
  }

  return NextResponse.json({
    audit: audit as Audit,
    pages: (pages ?? []) as AuditPage[],
  });
}
