import { NextResponse } from "next/server";

import { claimAndRunOne } from "@/lib/audit/queue";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
// Pin near Supabase to cut per-call round trips during the page loop.
// Must be a string literal — Next.js's route-segment-config analyzer cannot
// follow cross-module imports. See lib/config/region.ts for region options.
export const preferredRegion = "iad1";

/**
 * Background runner kick. Invoked fire-and-forget by the startAudit server
 * action with a shared secret header. Uses a service-role Supabase client so
 * the runner survives the original request's cookie teardown.
 *
 * Caller must already have validated that the user has access to the audit;
 * this route only checks the runner secret. Actual scheduling goes through
 * `claimAndRunOne` so a manual kick and a cron tick race on the same lease
 * — only one runner ever runs a given audit at a time.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const expected = process.env.AUDIT_RUNNER_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "Runner not configured" },
      { status: 503 },
    );
  }

  const provided = request.headers.get("x-audit-runner-token")?.trim();
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const supabase = createServiceClient();

  const { data: audit, error: auditErr } = await supabase
    .from("audits")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (auditErr || !audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  // Intentionally do not await: respond 202 immediately so the caller's
  // fire-and-forget fetch returns quickly. The runtime keeps the function
  // alive until the promise resolves (Vercel honors maxDuration above).
  void claimAndRunOne(supabase, audit.id).catch(() => {
    /* swallow: queue helper handles retry / failure bookkeeping itself */
  });

  return NextResponse.json({ accepted: true }, { status: 202 });
}
