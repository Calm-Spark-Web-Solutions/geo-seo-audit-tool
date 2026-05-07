"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { companyInputSchema } from "@/lib/validation/companies";

export type CompanyFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"name" | "contact_name" | "contact_email", string>>;
};

function parseForm(formData: FormData) {
  return companyInputSchema.safeParse({
    name: formData.get("name"),
    contact_name: formData.get("contact_name") ?? "",
    contact_email: formData.get("contact_email") ?? "",
  });
}

function fieldErrorsFrom(zodError: import("zod").ZodError): CompanyFormState["fieldErrors"] {
  const result: CompanyFormState["fieldErrors"] = {};
  for (const issue of zodError.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && key in {
      name: 1, contact_name: 1, contact_email: 1,
    }) {
      result[key as keyof NonNullable<CompanyFormState["fieldErrors"]>] = issue.message;
    }
  }
  return result;
}

export async function createCompany(
  _prev: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data, error } = await supabase
    .from("companies")
    .insert({ ...parsed.data, user_id: user.id })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to create organization." };
  }

  revalidatePath("/companies");
  revalidatePath("/dashboard");
  redirect(`/companies/${data.id}`);
}

export async function updateCompany(
  _prev: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return { ok: false, error: "Missing organization id." };
  }

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  revalidatePath("/dashboard");
  redirect(`/companies/${id}`);
}

export async function deleteCompany(companyId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("companies").delete().eq("id", companyId);
  if (error) throw new Error(error.message);

  revalidatePath("/companies");
  revalidatePath("/dashboard");
  redirect("/companies");
}
