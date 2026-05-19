import type { Ga4AccountOption, Ga4PropertyOption } from "./match-property";

export interface Ga428DayTotals {
  sessions: number;
  activeUsers: number;
}

function propertyResourceName(propertyId: string): string {
  return propertyId.startsWith("properties/")
    ? propertyId
    : `properties/${propertyId}`;
}

function numericPropertyId(propertyId: string): string {
  const m = propertyId.match(/properties\/(\d+)/);
  return m ? m[1] : propertyId.replace(/^properties\//, "");
}

async function enrichGa4PropertiesWithStreams(
  accessToken: string,
  properties: Ga4PropertyOption[],
): Promise<void> {
  const cap = Math.min(properties.length, 25);
  await Promise.all(
    properties.slice(0, cap).map(async (prop) => {
      try {
        const pid = numericPropertyId(prop.propertyId);
        const streamsUrl = new URL(
          `https://analyticsadmin.googleapis.com/v1beta/properties/${pid}/dataStreams`,
        );
        streamsUrl.searchParams.set("pageSize", "5");
        const res = await fetch(streamsUrl.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          dataStreams?: Array<{
            displayName?: string;
            webStreamData?: { defaultUri?: string };
          }>;
        };
        const stream = data.dataStreams?.find(
          (s) => s.webStreamData?.defaultUri,
        );
        if (stream?.webStreamData?.defaultUri) {
          prop.defaultUri = stream.webStreamData.defaultUri;
        }
        if (stream?.displayName) {
          prop.dataStreamName = stream.displayName;
        }
      } catch {
        /* ignore */
      }
    }),
  );
}

/** GA4 accounts with nested properties (RankMath-style picker data). */
export async function listGa4AccountsWithProperties(
  accessToken: string,
): Promise<Ga4AccountOption[]> {
  const accounts: Ga4AccountOption[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
    );
    url.searchParams.set("pageSize", "200");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GA4 accountSummaries failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as {
      accountSummaries?: Array<{
        account?: string;
        displayName?: string;
        propertySummaries?: Array<{
          property?: string;
          displayName?: string;
        }>;
      }>;
      nextPageToken?: string;
    };

    for (const row of data.accountSummaries ?? []) {
      if (!row.account) continue;
      const properties: Ga4PropertyOption[] = [];
      for (const prop of row.propertySummaries ?? []) {
        if (!prop.property) continue;
        properties.push({
          propertyId: prop.property,
          displayName: prop.displayName ?? prop.property,
        });
      }
      accounts.push({
        accountId: row.account,
        displayName: row.displayName ?? row.account,
        properties,
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  const flat = accounts.flatMap((a) => a.properties);
  await enrichGa4PropertiesWithStreams(accessToken, flat);
  return accounts;
}

export async function listGa4Properties(
  accessToken: string,
): Promise<Ga4PropertyOption[]> {
  const accounts = await listGa4AccountsWithProperties(accessToken);
  return accounts.flatMap((a) => a.properties);
}

export async function fetchGa4_28DayTotals(
  accessToken: string,
  propertyId: string,
): Promise<Ga428DayTotals> {
  const resource = propertyResourceName(propertyId);
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/${resource}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GA4 runReport failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    rows?: Array<{
      metricValues?: Array<{ value?: string }>;
    }>;
  };
  const vals = data.rows?.[0]?.metricValues ?? [];
  return {
    sessions: Number(vals[0]?.value ?? 0),
    activeUsers: Number(vals[1]?.value ?? 0),
  };
}
