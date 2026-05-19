export interface GscSiteOption {
  siteUrl: string;
}

export interface Ga4PropertyOption {
  propertyId: string;
  displayName: string;
  defaultUri?: string;
  /** Web data stream label when available (display only). */
  dataStreamName?: string;
}

export interface Ga4AccountOption {
  accountId: string;
  displayName: string;
  properties: Ga4PropertyOption[];
}

export interface PropertyMatchSuggestion {
  gscSiteUrl: string | null;
  ga4PropertyId: string | null;
}

function hostnameFromWebsiteUrl(websiteUrl: string): string | null {
  try {
    const host = new URL(websiteUrl).hostname.toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function hostMatchesGscSite(host: string, siteUrl: string): boolean {
  const lower = siteUrl.toLowerCase();
  if (lower.startsWith("sc-domain:")) {
    const domain = lower.slice("sc-domain:".length);
    return host === domain || host.endsWith(`.${domain}`);
  }
  try {
    const u = new URL(siteUrl);
    const siteHost = u.hostname.toLowerCase().replace(/^www\./, "");
    return host === siteHost || host.endsWith(`.${siteHost}`);
  } catch {
    return lower.includes(host);
  }
}

function hostMatchesGa4Property(
  host: string,
  prop: Ga4PropertyOption,
): boolean {
  if (prop.defaultUri) {
    try {
      const h = new URL(prop.defaultUri).hostname
        .toLowerCase()
        .replace(/^www\./, "");
      if (h === host || host.endsWith(`.${h}`)) return true;
    } catch {
      /* ignore */
    }
  }
  const name = prop.displayName.toLowerCase();
  return name.includes(host);
}

export function suggestGoogleProperties(
  websiteUrl: string,
  gscSites: GscSiteOption[],
  ga4Properties: Ga4PropertyOption[],
): PropertyMatchSuggestion {
  const host = hostnameFromWebsiteUrl(websiteUrl);
  if (!host) {
    return { gscSiteUrl: null, ga4PropertyId: null };
  }

  const gsc =
    gscSites.find((s) => hostMatchesGscSite(host, s.siteUrl)) ??
    gscSites[0] ??
    null;
  const ga4 =
    ga4Properties.find((p) => hostMatchesGa4Property(host, p)) ??
    ga4Properties[0] ??
    null;

  return {
    gscSiteUrl: gsc?.siteUrl ?? null,
    ga4PropertyId: ga4?.propertyId ?? null,
  };
}
