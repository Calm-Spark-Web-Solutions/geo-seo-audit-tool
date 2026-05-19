import type { Ga4AccountOption } from "./match-property";

export const googlePropertySelectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

export type GoogleMappingStatus = "mapped" | "partial" | "none";

export function googleMappingStatus(
  gscSiteUrl: string | null | undefined,
  ga4PropertyId: string | null | undefined,
): GoogleMappingStatus {
  const gsc = Boolean(gscSiteUrl?.trim());
  const ga4 = Boolean(ga4PropertyId?.trim());
  if (gsc && ga4) return "mapped";
  if (gsc || ga4) return "partial";
  return "none";
}

export function accountIdForGa4Property(
  accounts: Ga4AccountOption[],
  propertyId: string,
): string {
  if (!propertyId) return "";
  return (
    accounts.find((a) =>
      a.properties.some((p) => p.propertyId === propertyId),
    )?.accountId ?? ""
  );
}

export function friendlyGscApiError(raw: string): string {
  if (raw.includes("webmasters.googleapis.com") && raw.includes("SERVICE_DISABLED")) {
    return "Enable the Google Search Console API in your Google Cloud project, then refresh.";
  }
  if (raw.includes("403") && raw.includes("sufficient permission")) {
    return "This Google account does not have access to the mapped Search Console property.";
  }
  return raw.length > 280 ? `${raw.slice(0, 280)}…` : raw;
}

export function friendlyGa4ApiError(raw: string): string {
  if (
    raw.includes("analyticsadmin.googleapis.com") &&
    raw.includes("SERVICE_DISABLED")
  ) {
    return "Enable the Google Analytics Admin API (and Analytics Data API) in the same Google Cloud project as your OAuth client, then wait a few minutes and refresh.";
  }
  if (
    raw.includes("analyticsdata.googleapis.com") &&
    raw.includes("SERVICE_DISABLED")
  ) {
    return "Enable the Google Analytics Data API in Google Cloud, then refresh.";
  }
  return raw.length > 280 ? `${raw.slice(0, 280)}…` : raw;
}

export interface GooglePropertiesCatalog {
  gscSites: Array<{ siteUrl: string }>;
  ga4Accounts: Ga4AccountOption[];
  gscError: string | null;
  ga4Error: string | null;
}

export async function fetchGooglePropertiesCatalog(
  companyId: string,
): Promise<{ ok: true; catalog: GooglePropertiesCatalog } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/integrations/google/properties?company_id=${encodeURIComponent(companyId)}`,
  );
  const data = (await res.json()) as {
    error?: string;
    gscError?: string | null;
    ga4Error?: string | null;
    gscSites?: Array<{ siteUrl: string }>;
    ga4Accounts?: Ga4AccountOption[];
  };
  if (!res.ok) {
    return { ok: false, error: data.error ?? "Failed to load Google properties." };
  }
  return {
    ok: true,
    catalog: {
      gscSites: data.gscSites ?? [],
      ga4Accounts: data.ga4Accounts ?? [],
      gscError: data.gscError ?? null,
      ga4Error: data.ga4Error ?? null,
    },
  };
}
