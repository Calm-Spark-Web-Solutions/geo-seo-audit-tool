-- Adds per-snapshot detail rows to the daily 28-day Google rollups:
--   * gsc_top_queries  : top 25 GSC queries (query, clicks, impressions, position, ctr)
--   * gsc_top_pages    : top 25 GSC landing pages (same shape, keyed by page URL)
--   * ga4_ai_referrals : sessions/active users from AI assistant hostnames
--                        (ChatGPT, Perplexity, Gemini, Copilot, Claude, etc.)
--
-- All three are nullable; existing rows stay valid and the UI tolerates missing
-- fields. No data type changes to the original totals columns.

alter table public.community_google_metrics_snapshots
  add column if not exists gsc_top_queries jsonb,
  add column if not exists gsc_top_pages jsonb,
  add column if not exists ga4_ai_referrals jsonb;

comment on column public.community_google_metrics_snapshots.gsc_top_queries is
  'Top GSC queries (28d) as JSON array: { query, clicks, impressions, position, ctr }.';

comment on column public.community_google_metrics_snapshots.gsc_top_pages is
  'Top GSC landing pages (28d) as JSON array: { page, clicks, impressions, position, ctr }.';

comment on column public.community_google_metrics_snapshots.ga4_ai_referrals is
  'GA4 sessionSource breakdown filtered to AI assistant hostnames (28d). JSON array of { source, label, group?, sessions, activeUsers }.';
