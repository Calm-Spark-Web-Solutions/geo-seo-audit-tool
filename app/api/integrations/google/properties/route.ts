import { NextResponse } from "next/server";

import { getGoogleAccessTokenForCompany } from "@/lib/integrations/google/connection";
import { listGa4AccountsWithProperties } from "@/lib/integrations/google/ga4";
import { listGscSites } from "@/lib/integrations/google/gsc";
import { isGoogleOAuthConfigured } from "@/lib/integrations/google/config";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isGoogleOAuthConfigured()) {
    return NextResponse.json(
      { error: "Google OAuth is not configured." },
      { status: 503 },
    );
  }

  const companyId = new URL(request.url).searchParams.get("company_id")?.trim();
  if (!companyId) {
    return NextResponse.json({ error: "company_id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: member } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const accessToken = await getGoogleAccessTokenForCompany(supabase, companyId);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Google is not connected or token refresh failed." },
      { status: 400 },
    );
  }

  let gscSites: Awaited<ReturnType<typeof listGscSites>> = [];
  let gscError: string | null = null;
  let ga4Accounts: Awaited<ReturnType<typeof listGa4AccountsWithProperties>> = [];
  let ga4Error: string | null = null;

  try {
    gscSites = await listGscSites(accessToken);
  } catch (err) {
    gscError = err instanceof Error ? err.message : "Failed to list Search Console sites";
  }

  try {
    ga4Accounts = await listGa4AccountsWithProperties(accessToken);
  } catch (err) {
    ga4Error = err instanceof Error ? err.message : "Failed to list GA4 properties";
  }

  if (gscError && ga4Error) {
    return NextResponse.json({ error: ga4Error, gscError, ga4Error }, { status: 502 });
  }

  const ga4Properties = ga4Accounts.flatMap((a) => a.properties);
  return NextResponse.json({
    gscSites: gscSites.map((s) => ({ siteUrl: s.siteUrl })),
    gscError,
    ga4Error,
    ga4Accounts: ga4Accounts.map((a) => ({
      accountId: a.accountId,
      displayName: a.displayName,
      properties: a.properties.map((p) => ({
        propertyId: p.propertyId,
        displayName: p.displayName,
        defaultUri: p.defaultUri,
        dataStreamName: p.dataStreamName,
      })),
    })),
    ga4Properties: ga4Properties.map((p) => ({
      propertyId: p.propertyId,
      displayName: p.displayName,
      defaultUri: p.defaultUri,
      dataStreamName: p.dataStreamName,
    })),
  });
}
