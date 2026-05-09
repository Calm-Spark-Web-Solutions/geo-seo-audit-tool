"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { consumeRateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/security/client-ip";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";
import { safeNextPath } from "@/lib/validation/redirect";

export type AuthFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password", string>>;
  sent?: boolean;
  email?: string;
};

// Generic copy intentionally — never reveal whether the email exists,
// whether the password was right, or which limit fired. Same surface for
// human typos and credential-stuffing scripts.
const RATE_LIMIT_COPY = "Too many attempts. Please wait a few minutes and try again.";

// 10 sign-in attempts per IP per 5 minutes blunts credential stuffing
// without locking out a legitimate human who fat-fingered their password.
const SIGNIN_MAX = 10;
const SIGNIN_WINDOW_S = 5 * 60;

// Sign-up is much rarer per real human (one per launch), so a tighter
// cap deters spam-account creation from a single IP.
const SIGNUP_MAX = 5;
const SIGNUP_WINDOW_S = 60 * 60;

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

  // Rate-limit BEFORE the password check so a credential-stuffing run
  // can't spend our cap-bucket per attempt. `unknown` falls back to a
  // shared bucket only when no proxy header is available (local dev).
  const ip = getClientIp(await headers()) ?? "unknown";
  const allowed = await consumeRateLimit(
    supabase,
    `auth:signin:${ip}`,
    SIGNIN_MAX,
    SIGNIN_WINDOW_S,
  );
  if (!allowed) {
    return { ok: false, error: RATE_LIMIT_COPY };
  }

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

  const next = safeNextPath(formData.get("next"));
  const count = await membershipCountForUser(data.user.id);
  // If the user has memberships, honor `next` (e.g. /invite/<token>);
  // otherwise force them through onboarding to create their first org.
  if (count > 0) {
    redirect(next ?? "/dashboard");
  }
  redirect("/onboarding");
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

  // Sign-up is rare per real user; cap per-IP per-hour to deter spam
  // account creation against the email service.
  const ip = getClientIp(await headers()) ?? "unknown";
  const allowed = await consumeRateLimit(
    supabase,
    `auth:signup:${ip}`,
    SIGNUP_MAX,
    SIGNUP_WINDOW_S,
  );
  if (!allowed) {
    return { ok: false, error: RATE_LIMIT_COPY };
  }

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
    const next = safeNextPath(formData.get("next"));
    const count = await membershipCountForUser(data.user.id);
    if (count > 0) {
      redirect(next ?? "/dashboard");
    }
    redirect("/onboarding");
  }

  return { ok: true, sent: true, email: parsed.data.email };
}
