import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Atomically consume one slot from a sliding-window rate-limit bucket.
 *
 * Backed by `public.consume_rate_limit(p_key, p_max, p_window_seconds)` —
 * a SECURITY DEFINER plpgsql function that does an upsert + `select for
 * update` to make the increment safe under contention.
 *
 * Returns:
 *   - true   the call is within the cap; counter was incremented
 *   - false  the cap is exhausted for the current window
 *
 * Failures (network, permission, missing function) are treated as `false`
 * so we fail closed: rather than letting a database hiccup waive the cap
 * we make the caller surface a friendly error.
 */
export async function consumeRateLimit(
  supabase: SupabaseClient,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    // Surfaces the real cause (e.g. "function consume_rate_limit does not
    // exist" when migration 009 hasn't been applied) instead of silently
    // looking like a rate-limit hit to the caller.
    console.error("consume_rate_limit failed; failing closed", {
      key,
      code: error.code,
      message: error.message,
    });
    return false;
  }
  return data === true;
}
