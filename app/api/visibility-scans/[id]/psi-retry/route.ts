import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { retryMissingPsiForAudit } from "@/lib/audit/psi-retry";
import { consumeRateLimit } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const preferredRegion = "iad1";

/**
 * Bulk Lighthouse retry budget. One call here can fan out into up to
 * `MAX_INLINE_RETRIES` PSI requests, so the bucket is intentionally
 * tighter than the per-page `audit:page-refresh:<user>` limiter
 * (10 / 60 s). Three pulls per 10 minutes gives the user enough rope
 * to react to a flaky run without enabling accidental loops.
 */
const PSI_RETRY_ALL_MAX = 3;
const PSI_RETRY_ALL_WINDOW_S = 600;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: auditId } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS gates audit access — fetch a single row scoped to the user. A
  // null result here means the user can't see this audit (or it doesn't
  // exist); either way 404 keeps the boundary tight.
  const { data: audit } = await supabase
    .from("audits")
    .select("id, community_id")
    .eq("id", auditId)
    .maybeSingle();

  if (!audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  const allowed = await consumeRateLimit(
    supabase,
    `audit:psi-retry-all:${user.id}`,
    PSI_RETRY_ALL_MAX,
    PSI_RETRY_ALL_WINDOW_S,
  );
  if (!allowed) {
    return NextResponse.json(
      {
        error:
          "Too many bulk Lighthouse retries. Please wait a few minutes and try again.",
      },
      { status: 429 },
    );
  }

  const result = await retryMissingPsiForAudit(supabase, auditId);

  // Revalidate the scan overview + community list so the new coverage
  // counts show up on the next render. Page-detail pages each refresh
  // their own data on navigation.
  const cid = audit.community_id as string | undefined;
  if (cid) revalidatePath(`/communities/${cid}`);
  revalidatePath(`/visibility-scans/${auditId}`);

  return NextResponse.json({ ok: true, ...result });
}
