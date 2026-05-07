"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { communityInputSchema } from "@/lib/validation/communities";

export type CommunityFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"name" | "website_url", string>>;
};

function parseForm(formData: FormData) {
  return communityInputSchema.safeParse({
    name: formData.get("name"),
    website_url: formData.get("website_url"),
  });
}

function fieldErrorsFrom(zodError: import("zod").ZodError): CommunityFormState["fieldErrors"] {
  const result: CommunityFormState["fieldErrors"] = {};
  for (const issue of zodError.issues) {
    const key = issue.path[0];
    if (key === "name" || key === "website_url") {
      result[key] = issue.message;
    }
  }
  return result;
}

export async function createCommunity(
  _prev: CommunityFormState,
  formData: FormData,
): Promise<CommunityFormState> {
  const companyId = formData.get("company_id");
  if (typeof companyId !== "string" || !companyId) {
    return { ok: false, error: "Missing organization id." };
  }

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("communities")
    .insert({ ...parsed.data, company_id: companyId })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to create community." };
  }

  revalidatePath(`/companies/${companyId}`);
  redirect(`/communities/${data.id}`);
}

export async function updateCommunity(
  _prev: CommunityFormState,
  formData: FormData,
): Promise<CommunityFormState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return { ok: false, error: "Missing community id." };
  }

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("communities")
    .select("company_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("communities")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/communities/${id}`);
  if (existing?.company_id) revalidatePath(`/companies/${existing.company_id}`);
  redirect(`/communities/${id}`);
}

export async function deleteCommunity(communityId: string): Promise<void> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("communities")
    .select("company_id")
    .eq("id", communityId)
    .maybeSingle();

  const { error } = await supabase
    .from("communities")
    .delete()
    .eq("id", communityId);

  if (error) throw new Error(error.message);

  if (existing?.company_id) {
    revalidatePath(`/companies/${existing.company_id}`);
    redirect(`/companies/${existing.company_id}`);
  }
  redirect("/companies");
}
