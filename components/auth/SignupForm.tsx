"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  resendSignupConfirmation,
  signUp,
  type AuthFormState,
} from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthFormState = { ok: true };

export function SignupForm({ next }: { next?: string | null }) {
  const [state, formAction, pending] = useActionState(signUp, initialState);
  const [resendState, resendAction, resending] = useActionState(
    resendSignupConfirmation,
    initialState,
  );

  if (state.sent) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="text-sm">
          We sent a confirmation link to{" "}
          <span className="font-medium text-foreground">{state.email}</span>.
          Click the link in your inbox to finish creating your account.
        </p>
        <p className="text-xs text-muted-foreground">
          Didn&apos;t get it? Check your spam folder, or resend the link
          below.
        </p>
        <form action={resendAction}>
          <input
            type="hidden"
            name="email"
            value={state.email ?? ""}
          />
          <Button type="submit" variant="outline" disabled={resending}>
            {resending
              ? "Sending…"
              : resendState.sent
                ? "Sent — check your inbox"
                : "Resend confirmation email"}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Already confirmed?{" "}
          <Link
            href={
              next ? `/login?next=${encodeURIComponent(next)}` : "/login"
            }
            className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
          >
            Sign in
          </Link>
          .
        </p>
        <Button variant="ghost" asChild>
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field
        label="Email"
        htmlFor="email"
        error={state.fieldErrors?.email}
      >
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={255}
          placeholder="name@example.com"
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={200}
        />
      </Field>

      {state.error && !state.fieldErrors ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Creating account..." : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
