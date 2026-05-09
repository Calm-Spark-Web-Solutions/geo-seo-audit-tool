import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client used by background jobs (audit runner) that
 * outlive the original request and therefore cannot rely on the user's
 * cookies. RLS is bypassed; callers MUST validate access in the originating
 * action before delegating to a runner that uses this client.
 *
 * Server-only. Never import from a client component or `"use client"` file.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
