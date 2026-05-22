"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { z } from "zod";

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
  /** Recoverable hint to render after a successful password update. */
  passwordUpdated?: boolean;
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
  // Always honor an invite-return `next` — a brand-new account with zero
  // memberships should be allowed to *accept* the invite they were sent
  // instead of being trapped in /onboarding to create their own org.
  if (next && next.startsWith("/invite/")) {
    redirect(next);
  }
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
  // Pass `next` through Supabase's email confirmation so a user who signs
  // up from an invite link returns to that invite after clicking the
  // confirmation email — not to a generic onboarding flow.
  const nextForEmail = safeNextPath(formData.get("next"));
  const callbackUrl = origin
    ? nextForEmail
      ? `${origin}/auth/callback?next=${encodeURIComponent(nextForEmail)}`
      : `${origin}/auth/callback`
    : undefined;
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: callbackUrl,
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
    if (next && next.startsWith("/invite/")) {
      redirect(next);
    }
    if (count > 0) {
      redirect(next ?? "/dashboard");
    }
    redirect("/onboarding");
  }

  return { ok: true, sent: true, email: parsed.data.email };
}

// ─── Resend confirmation email ───────────────────────────────────────────

export async function resendSignupConfirmation(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const emailValue = formData.get("email");
  const parsed = z
    .object({
      email: z
        .string()
        .trim()
        .min(1, "Email is required")
        .max(255)
        .email("Must be a valid email"),
    })
    .safeParse({ email: emailValue });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Enter the email address you signed up with.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const supabase = await createClient();
  const ip = getClientIp(await headers()) ?? "unknown";
  const allowed = await consumeRateLimit(
    supabase,
    `auth:resend:${ip}`,
    5,
    60 * 60,
  );
  if (!allowed) return { ok: false, error: RATE_LIMIT_COPY };

  const origin = await getOrigin();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: {
      emailRedirectTo: origin ? `${origin}/auth/callback` : undefined,
    },
  });
  if (error) {
    // Don't leak whether the email exists — a friendly success either way.
  }
  return { ok: true, sent: true, email: parsed.data.email };
}

// ─── Password reset request (sends recovery email) ───────────────────────

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = z
    .object({
      email: z
        .string()
        .trim()
        .min(1, "Email is required")
        .max(255)
        .email("Must be a valid email"),
    })
    .safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const supabase = await createClient();

  // Rate-limit so this can't be used as a spam relay against the email service.
  const ip = getClientIp(await headers()) ?? "unknown";
  const allowed = await consumeRateLimit(
    supabase,
    `auth:reset:${ip}`,
    5,
    60 * 60,
  );
  if (!allowed) return { ok: false, error: RATE_LIMIT_COPY };

  const origin = await getOrigin();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: origin
      ? `${origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`
      : undefined,
  });
  // Always report success to avoid leaking whether an account exists.
  return { ok: true, sent: true, email: parsed.data.email };
}

// ─── Set a new password after recovery callback ──────────────────────────

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200);

export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = z
    .object({ password: passwordSchema })
    .safeParse({ password: formData.get("password") });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error:
        "Your reset link has expired. Request a new one from the forgot-password page.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return { ok: false, error: error.message };
  }

  redirect("/dashboard");
}
