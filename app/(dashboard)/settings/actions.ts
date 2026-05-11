"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type UpdateProfileResult = { ok: true } | { ok: false; error: string };

const MAX_NAME = 120;
const MAX_AVATAR_URL = 2000;

export async function updateProfile(
  formData: FormData,
): Promise<UpdateProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const fullName = String(formData.get("full_name") ?? "").trim();
  const avatarRaw = String(formData.get("avatar_url") ?? "").trim();

  if (fullName.length > MAX_NAME) {
    return { ok: false, error: `Name must be at most ${MAX_NAME} characters.` };
  }
  if (avatarRaw.length > MAX_AVATAR_URL) {
    return {
      ok: false,
      error: `Avatar URL must be at most ${MAX_AVATAR_URL} characters.`,
    };
  }

  if (avatarRaw) {
    let url: URL;
    try {
      url = new URL(avatarRaw);
    } catch {
      return {
        ok: false,
        error: "Enter a valid http or https URL for the avatar, or leave it blank.",
      };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return {
        ok: false,
        error: "Avatar URL must start with http:// or https://.",
      };
    }
  }

  const prev = (user.user_metadata ?? {}) as Record<string, unknown>;
  const nextData = {
    ...prev,
    full_name: fullName.length > 0 ? fullName : null,
    avatar_url: avatarRaw.length > 0 ? avatarRaw : null,
  };

  const { error } = await supabase.auth.updateUser({ data: nextData });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  return { ok: true };
}
