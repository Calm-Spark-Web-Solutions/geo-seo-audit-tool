"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";

export type AuthFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password", string>>;
  sent?: boolean;
  email?: string;
};

function fieldErrorsFrom(
  zodError: import("zod").ZodError,
): AuthFormState["fieldErrors"] {
  const result: AuthFormState["fieldErrors"] = {};
  for (const issue of zodError.issues) {
    const key = issue.path[0];
    if (key === "email" || key === "password") {
      result[key] = issue.message;
    }
  }
  return result;
}

async function getOrigin(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const h = await headers();
  return (h.get("origin") ?? "").replace(/\/$/, "");
}

async function membershipCountForUser(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("company_members")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    const message = error?.message ?? "Unable to sign in.";
    const friendly = /invalid login credentials/i.test(message)
      ? "Email or password is incorrect."
      : /email not confirmed/i.test(message)
        ? "Please confirm your email before signing in."
        : message;
    return { ok: false, error: friendly };
  }

  const count = await membershipCountForUser(data.user.id);
  redirect(count > 0 ? "/dashboard" : "/onboarding");
}

export async function signUp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const supabase = await createClient();
  const origin = await getOrigin();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: origin ? `${origin}/auth/callback` : undefined,
    },
  });

  if (error) {
    const message = error.message;
    const friendly = /already registered|already been registered/i.test(message)
      ? "An account with that email already exists. Try signing in."
      : message;
    return { ok: false, error: friendly };
  }

  // When email confirmation is enabled, `data.session` is null and the user
  // must click the link in their inbox before signing in.
  if (!data.session) {
    return { ok: true, sent: true, email: parsed.data.email };
  }

  // Email confirmation disabled in the project: user is signed in immediately.
  if (data.user) {
    const count = await membershipCountForUser(data.user.id);
    redirect(count > 0 ? "/dashboard" : "/onboarding");
  }

  return { ok: true, sent: true, email: parsed.data.email };
}
