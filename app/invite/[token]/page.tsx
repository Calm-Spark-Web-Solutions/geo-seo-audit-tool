import Link from "next/link";

import { signOutAndReturnToInvite } from "@/app/invite/[token]/sign-out-action";
import { AcceptInviteForm } from "@/components/invites/AcceptInviteForm";
import { Brand } from "@/components/layout/Brand";
import { ThemeToggleFixed } from "@/components/theme/ThemeToggleFixed";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loadInvitePreview } from "@/lib/invites-preview";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatRole(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const nextPath = `/invite/${encodeURIComponent(token)}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const previewResult = await loadInvitePreview(token);
  const preview = previewResult.ok ? previewResult.preview : null;

  const invitedEmail = preview?.email.toLowerCase() ?? null;
  const signedInEmail = user?.email?.toLowerCase() ?? null;
  const emailMismatch =
    user && invitedEmail && signedInEmail && invitedEmail !== signedInEmail;

  return (
    <main
      id="main"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6"
    >
      <ThemeToggleFixed />
      <Brand size="lg" />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>
            {preview
              ? `Join ${preview.organizationName}`
              : "Accept team invite"}
          </CardTitle>
          <CardDescription>
            {preview
              ? `${
                  preview.inviterName ??
                  preview.inviterEmail ??
                  "A teammate"
                } invited ${preview.email} as ${formatRole(preview.role)}.`
              : "Sign in with the email this invite was sent to."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!previewResult.ok ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {previewResult.reason === "expired"
                ? "This invite has expired. Ask the person who invited you to send a new one."
                : previewResult.reason === "accepted"
                  ? "This invite has already been accepted. Sign in to your account to continue."
                  : "We couldn't find this invite. Double-check the link or ask the person who invited you to send a new one."}
            </p>
          ) : null}

          {preview && !user ? (
            <>
              <Button asChild>
                <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>
                  Sign in to accept
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/signup?next=${encodeURIComponent(nextPath)}`}>
                  Create account with {preview.email}
                </Link>
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Use the same email this invite was sent to.
              </p>
            </>
          ) : null}

          {preview && user && !emailMismatch ? (
            <>
              <AcceptInviteForm token={token} />
              <p className="text-center text-xs text-muted-foreground">
                Signed in as {user.email}.
              </p>
            </>
          ) : null}

          {preview && user && emailMismatch ? (
            <>
              <p className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                You&apos;re signed in as <strong>{user.email}</strong>, but this
                invite was sent to <strong>{preview.email}</strong>. Sign in
                with the invited address to accept.
              </p>
              <form action={signOutAndReturnToInvite}>
                <input type="hidden" name="next" value={nextPath} />
                <Button type="submit" className="w-full">
                  Sign in with a different account
                </Button>
              </form>
            </>
          ) : null}
        </CardContent>
      </Card>
      <Link
        href="/"
        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        Back to home
      </Link>
    </main>
  );
}
