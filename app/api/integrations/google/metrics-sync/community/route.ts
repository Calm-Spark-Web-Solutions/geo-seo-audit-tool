import { NextResponse } from "next/server";

import { getCompanyIdForCommunity } from "@/lib/integrations/google/connection";
import { syncGoogleMetricsForCommunityDetailed } from "@/lib/integrations/google/metrics-snapshot";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { community_id?: string };
  try {
    body = (await request.json()) as { community_id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const communityId = body.community_id?.trim();
  if (!communityId) {
    return NextResponse.json({ error: "community_id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyId = await getCompanyIdForCommunity(supabase, communityId);
  if (!companyId) {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }

  const { data: member } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || !["owner", "admin"].includes(member.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await syncGoogleMetricsForCommunityDetailed(
    supabase,
    communityId,
    "daily_sync",
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    metrics: result.metrics,
    warnings: result.warnings,
  });
}
