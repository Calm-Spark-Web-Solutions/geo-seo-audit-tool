import { describe, expect, it, vi } from "vitest";

import type { GaAiReferral, GscPageRow, GscQueryRow } from "@/types";

import { upsertCommunityGoogleMetricsSnapshot } from "./metrics-snapshot";

interface CapturedUpsert {
  table: string;
  row: Record<string, unknown>;
  options: { onConflict?: string } | undefined;
}

function createFakeSupabase() {
  const captured: CapturedUpsert[] = [];
  const client = {
    from(table: string) {
      return {
        upsert(row: Record<string, unknown>, options?: { onConflict?: string }) {
          captured.push({ table, row, options });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  // The function is typed against a SupabaseClient; we only exercise the
  // narrow surface (`from(...).upsert(...)`), so a structural cast is safe.
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: client as any,
    captured,
  };
}

describe("upsertCommunityGoogleMetricsSnapshot", () => {
  it("persists detail columns alongside the existing totals", async () => {
    const { client, captured } = createFakeSupabase();

    const topQueries: GscQueryRow[] = [
      { query: "senior living near me", clicks: 12, impressions: 320, position: 4.2, ctr: 0.04 },
    ];
    const topPages: GscPageRow[] = [
      { page: "https://example.com/", clicks: 8, impressions: 200, position: 5.1, ctr: 0.04 },
    ];
    const aiReferrals: GaAiReferral[] = [
      { source: "chatgpt.com", label: "ChatGPT", group: "OpenAI", sessions: 3, activeUsers: 2 },
    ];

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-19T12:00:00Z"));

    const result = await upsertCommunityGoogleMetricsSnapshot(client, {
      communityId: "co-1",
      metrics: {
        gsc_clicks_28d: 100,
        gsc_impressions_28d: 2000,
        ga4_sessions_28d: 150,
        ga4_active_users_28d: 130,
      },
      details: {
        gsc_top_queries: topQueries,
        gsc_top_pages: topPages,
        ga4_ai_referrals: aiReferrals,
      },
      source: "daily_sync",
      auditId: null,
    });

    vi.useRealTimers();

    expect(result.ok).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0].table).toBe("community_google_metrics_snapshots");
    expect(captured[0].options).toEqual({
      onConflict: "community_id,snapshot_date",
    });
    expect(captured[0].row).toMatchObject({
      community_id: "co-1",
      snapshot_date: "2026-05-19",
      gsc_clicks_28d: 100,
      gsc_impressions_28d: 2000,
      ga4_sessions_28d: 150,
      ga4_active_users_28d: 130,
      gsc_top_queries: topQueries,
      gsc_top_pages: topPages,
      ga4_ai_referrals: aiReferrals,
      source: "daily_sync",
      audit_id: null,
    });
  });

  it("writes null for absent detail columns so callers can clear stale data", async () => {
    const { client, captured } = createFakeSupabase();

    await upsertCommunityGoogleMetricsSnapshot(client, {
      communityId: "co-2",
      metrics: {
        gsc_clicks_28d: 0,
        gsc_impressions_28d: 0,
        ga4_sessions_28d: 0,
        ga4_active_users_28d: 0,
      },
      source: "audit",
      auditId: "audit-1",
    });

    expect(captured[0].row.gsc_top_queries).toBeNull();
    expect(captured[0].row.gsc_top_pages).toBeNull();
    expect(captured[0].row.ga4_ai_referrals).toBeNull();
    expect(captured[0].row.audit_id).toBe("audit-1");
  });
});
