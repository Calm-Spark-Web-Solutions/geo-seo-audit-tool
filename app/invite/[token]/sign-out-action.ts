"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation/redirect";

export async function signOutAndReturnToInvite(
  formData: FormData,
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Fall through to redirect even if session cleanup fails.
  }
  const next = safeNextPath(formData.get("next")) ?? "/login";
  const dest = next.startsWith("/invite/")
    ? `/login?next=${encodeURIComponent(next)}`
    : "/login";
  redirect(dest);
}
