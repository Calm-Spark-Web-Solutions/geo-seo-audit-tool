"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type UpdateProfileResult = { ok: true } | { ok: false; error: string };

const MAX_NAME = 120;

export async function updateProfile(
  formData: FormData,
): Promise<UpdateProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const fullName = String(formData.get("full_name") ?? "").trim();

  if (fullName.length > MAX_NAME) {
    return { ok: false, error: `Name must be at most ${MAX_NAME} characters.` };
  }

  const prev = (user.user_metadata ?? {}) as Record<string, unknown>;
  const nextData = {
    ...prev,
    full_name: fullName.length > 0 ? fullName : null,
  };

  const { error } = await supabase.auth.updateUser({ data: nextData });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  return { ok: true };
}
