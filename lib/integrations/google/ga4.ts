import type { Ga4AccountOption, Ga4PropertyOption } from "./match-property";

import {
  AI_ASSISTANT_HOSTS,
  aiAssistantFromHost,
  aiAssistantHostList,
} from "./ai-assistant-hosts";

export interface Ga428DayTotals {
  sessions: number;
  activeUsers: number;
}

/** One AI-assistant referrer row aggregated over the last 28 days. */
export interface GaAiReferral {
  /** Raw GA4 `sessionSource` value, e.g. "chat.openai.com". */
  source: string;
  /** Friendly display label (e.g. "ChatGPT"). */
  label: string;
  /** Optional grouping (e.g. "OpenAI") for collapsing multi-host vendors. */
  group?: string;
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

/**
 * Build the GA4 `dimensionFilter` payload that limits a `runReport` to AI
 * assistant hostnames. Exported for tests so we can assert exactly which hosts
 * we ask GA4 about.
 */
export function buildAiAssistantSessionSourceFilter(): {
  filter: {
    fieldName: "sessionSource";
    inListFilter: { values: string[]; caseSensitive: false };
  };
} {
  return {
    filter: {
      fieldName: "sessionSource",
      inListFilter: {
        values: aiAssistantHostList(),
        caseSensitive: false,
      },
    },
  };
}

/**
 * Fetch 28-day session + active user counts grouped by `sessionSource`,
 * filtered to known AI assistant hostnames.
 *
 * Returns an empty array when GA4 has no matching rows. Unknown hosts that
 * sneak through the filter (e.g. case variants) are mapped back via the
 * curated lookup and dropped if still unknown.
 */
export async function fetchGa4AiReferrals(
  accessToken: string,
  propertyId: string,
): Promise<GaAiReferral[]> {
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
        dimensions: [{ name: "sessionSource" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }],
        dimensionFilter: buildAiAssistantSessionSourceFilter(),
        limit: String(AI_ASSISTANT_HOSTS.length * 2),
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GA4 AI referrals runReport failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    rows?: Array<{
      dimensionValues?: Array<{ value?: string }>;
      metricValues?: Array<{ value?: string }>;
    }>;
  };

  const referrals: GaAiReferral[] = [];
  for (const row of data.rows ?? []) {
    const source = (row.dimensionValues?.[0]?.value ?? "").trim();
    if (!source) continue;
    const match = aiAssistantFromHost(source);
    if (!match) continue;
    const sessions = Number(row.metricValues?.[0]?.value ?? 0);
    const activeUsers = Number(row.metricValues?.[1]?.value ?? 0);
    referrals.push({
      source,
      label: match.label,
      group: match.group,
      sessions,
      activeUsers,
    });
  }

  referrals.sort((a, b) => b.sessions - a.sessions);
  return referrals;
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
