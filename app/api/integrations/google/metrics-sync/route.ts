import { NextResponse } from "next/server";

import { syncAllCommunityGoogleMetrics } from "@/lib/integrations/google/metrics-snapshot";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily cron: refresh 28-day GSC/GA4 snapshots for mapped communities.
 * Authorization matches visibility-scans/cron-tick (CRON_SECRET or runner token).
 */
export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

async function handle(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const runnerSecret = process.env.AUDIT_RUNNER_SECRET?.trim();

  const authHeader = request.headers.get("authorization")?.trim() ?? "";
  const runnerHeader = request.headers.get("x-audit-runner-token")?.trim() ?? "";

  const cronOk = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  const runnerOk =
    !!runnerSecret && runnerHeader.length > 0 && runnerHeader === runnerSecret;

  if (!cronOk && !runnerOk) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const result = await syncAllCommunityGoogleMetrics(supabase);
  return NextResponse.json(result);
}
