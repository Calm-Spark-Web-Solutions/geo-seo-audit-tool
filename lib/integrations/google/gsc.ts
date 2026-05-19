export interface GscSite {
  siteUrl: string;
  permissionLevel?: string;
}

export interface GscSitemap {
  path: string;
  lastSubmitted?: string;
  isPending?: boolean;
  isSitemapsIndex?: boolean;
  lastDownloaded?: string;
  warnings?: number;
  errors?: number;
}

export interface Gsc28DayTotals {
  clicks: number;
  impressions: number;
}

function encodeSiteUrl(siteUrl: string): string {
  return encodeURIComponent(siteUrl);
}

export async function listGscSites(
  accessToken: string,
): Promise<GscSite[]> {
  const res = await fetch(
    "https://www.googleapis.com/webmasters/v3/sites",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GSC sites.list failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }>;
  };
  return (data.siteEntry ?? [])
    .filter((e): e is { siteUrl: string; permissionLevel?: string } =>
      Boolean(e.siteUrl),
    )
    .map((e) => ({
      siteUrl: e.siteUrl,
      permissionLevel: e.permissionLevel,
    }));
}

export async function listGscSitemaps(
  accessToken: string,
  siteUrl: string,
): Promise<GscSitemap[]> {
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeSiteUrl(siteUrl)}/sitemaps`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GSC sitemaps.list failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    sitemap?: Array<{
      path?: string;
      lastSubmitted?: string;
      isPending?: boolean;
      isSitemapsIndex?: boolean;
      lastDownloaded?: string;
      warnings?: string;
      errors?: string;
    }>;
  };
  return (data.sitemap ?? [])
    .filter((s): s is { path: string } & typeof s => Boolean(s.path))
    .map((s) => ({
      path: s.path,
      lastSubmitted: s.lastSubmitted,
      isPending: s.isPending,
      isSitemapsIndex: s.isSitemapsIndex,
      lastDownloaded: s.lastDownloaded,
      warnings: s.warnings ? Number(s.warnings) : 0,
      errors: s.errors ? Number(s.errors) : 0,
    }));
}

function formatIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function fetchGsc28DayTotals(
  accessToken: string,
  siteUrl: string,
): Promise<Gsc28DayTotals> {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);

  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeSiteUrl(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: formatIsoDate(start),
        endDate: formatIsoDate(end),
        dimensions: [],
        rowLimit: 1,
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GSC searchAnalytics.query failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    rows?: Array<{ clicks?: number; impressions?: number }>;
  };
  const row = data.rows?.[0];
  return {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
  };
}
