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

/** One row from a GSC searchAnalytics.query dimensional response. */
export interface GscQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  /** Avg result position over the window (lower is better). */
  position: number;
  /** Click-through rate as a fraction (0..1). */
  ctr: number;
}

export interface GscPageRow {
  page: string;
  clicks: number;
  impressions: number;
  position: number;
  ctr: number;
}

export interface Gsc28DayBreakdowns {
  topQueries: GscQueryRow[];
  topPages: GscPageRow[];
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

interface GscDimensionalRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

async function fetchGscDimensionalRows(
  accessToken: string,
  siteUrl: string,
  dimension: "query" | "page",
  rowLimit: number,
): Promise<GscDimensionalRow[]> {
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
        dimensions: [dimension],
        rowLimit,
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `GSC searchAnalytics.query (${dimension}) failed: ${res.status} ${text}`,
    );
  }
  const data = (await res.json()) as { rows?: GscDimensionalRow[] };
  return data.rows ?? [];
}

/**
 * Fetch top queries + top pages over the last 28 days for a GSC site.
 *
 * Both dimensions are fetched in parallel. Failure of one does not abort the
 * other — empty arrays are returned for the failed dimension so the caller can
 * still persist whatever succeeded.
 */
export async function fetchGsc28DayBreakdowns(
  accessToken: string,
  siteUrl: string,
  opts: { rowLimit?: number } = {},
): Promise<Gsc28DayBreakdowns> {
  const rowLimit = Math.max(1, Math.min(opts.rowLimit ?? 25, 100));

  const [queryRowsResult, pageRowsResult] = await Promise.allSettled([
    fetchGscDimensionalRows(accessToken, siteUrl, "query", rowLimit),
    fetchGscDimensionalRows(accessToken, siteUrl, "page", rowLimit),
  ]);

  const queryRows =
    queryRowsResult.status === "fulfilled" ? queryRowsResult.value : [];
  const pageRows =
    pageRowsResult.status === "fulfilled" ? pageRowsResult.value : [];

  const topQueries: GscQueryRow[] = queryRows
    .map((r) => ({
      query: (r.keys?.[0] ?? "").trim(),
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      position: r.position ?? 0,
      ctr: r.ctr ?? 0,
    }))
    .filter((r) => r.query.length > 0);

  const topPages: GscPageRow[] = pageRows
    .map((r) => ({
      page: (r.keys?.[0] ?? "").trim(),
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      position: r.position ?? 0,
      ctr: r.ctr ?? 0,
    }))
    .filter((r) => r.page.length > 0);

  return { topQueries, topPages };
}
