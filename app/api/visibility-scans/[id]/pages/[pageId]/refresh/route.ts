import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  type RefreshAuditPageLibResult,
  type RefreshAuditPageMode,
  refreshAuditPage,
} from "@/lib/audit/refresh-audit-page";
import { consumeRateLimit } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const preferredRegion = "iad1";

const PAGE_REFRESH_MAX = 10;
const PAGE_REFRESH_WINDOW_S = 60;

function statusForResult(
  r: Extract<RefreshAuditPageLibResult, { ok: false }>,
): number {
  switch (r.code) {
    case "not_found":
      return 404;
    case "forbidden_origin":
      return 403;
    case "no_psi_key":
      return 503;
    case "no_psi_data":
      return 422;
    case "fetch_failed":
      return 502;
    case "persist_failed":
      return 500;
    default:
      return 400;
  }
}

function parseMode(raw: unknown): RefreshAuditPageMode | null {
  if (raw === undefined || raw === null) return "psi";
  if (raw === "psi" || raw === "full") return raw;
  return null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; pageId: string }> },
) {
  const { id: auditId, pageId } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await consumeRateLimit(
    supabase,
    `audit:page-refresh:${user.id}`,
    PAGE_REFRESH_MAX,
    PAGE_REFRESH_WINDOW_S,
  );
  if (!allowed) {
    return NextResponse.json(
      {
        error:
          "Too many page refresh attempts. Please wait a minute and try again.",
      },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const mode = parseMode(
    typeof body === "object" && body !== null && "mode" in body
      ? (body as { mode?: unknown }).mode
      : undefined,
  );
  if (!mode) {
    return NextResponse.json(
      { error: 'Invalid body: "mode" must be "psi" or "full".' },
      { status: 400 },
    );
  }

  const result = await refreshAuditPage(supabase, {
    auditId,
    pageId,
    mode,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: statusForResult(result) },
    );
  }

  const { data: auditRow } = await supabase
    .from("audits")
    .select("community_id")
    .eq("id", auditId)
    .maybeSingle();
  const cid = auditRow?.community_id as string | undefined;
  if (cid) revalidatePath(`/communities/${cid}`);
  revalidatePath(`/visibility-scans/${auditId}`);
  revalidatePath(`/visibility-scans/${auditId}/pages/${pageId}`);

  return NextResponse.json({ ok: true, mode: result.mode });
}
