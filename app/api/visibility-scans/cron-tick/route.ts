import { NextResponse } from "next/server";

import { tickQueue } from "@/lib/audit/queue";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
// Literal required by Next.js's route-segment-config analyzer.
// See lib/config/region.ts for region options.
export const preferredRegion = "iad1";

/**
 * Cron sweep. Invoked once a minute by Vercel Cron (configured in
 * `vercel.json`) and on demand by ops via the `x-audit-runner-token`
 * header. Claims and runs up to TICK_BATCH queued / abandoned-lease jobs.
 *
 * Authorization: Vercel sets `Authorization: Bearer ${CRON_SECRET}` on
 * scheduled cron invocations. We also accept the existing
 * `x-audit-runner-token` to make manual triggering during dev painless.
 */
export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  // Vercel Cron emits GET, manual ops can do either. Treat both the same.
  return handle(request);
}

async function handle(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const runnerSecret = process.env.AUDIT_RUNNER_SECRET?.trim();

  const authHeader = request.headers.get("authorization")?.trim() ?? "";
  const runnerHeader = request.headers.get("x-audit-runner-token")?.trim() ?? "";

  const cronOk =
    !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  const runnerOk =
    !!runnerSecret && runnerHeader.length > 0 && runnerHeader === runnerSecret;

  if (!cronOk && !runnerOk) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  try {
    const result = await tickQueue(supabase);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tick failed";
    return NextResponse.json(
      { error: message, claimed: 0, reaped: 0, failed: 1 },
      { status: 500 },
    );
  }
}
