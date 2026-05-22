import Link from "next/link";

import { LoginForm } from "@/components/auth/LoginForm";
import { Brand } from "@/components/layout/Brand";
import { ThemeToggleFixed } from "@/components/theme/ThemeToggleFixed";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { safeNextPath } from "@/lib/validation/redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const safeNext = safeNextPath(next);

  return (
    <main
      id="main"
      className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6"
    >
      <ThemeToggleFixed />
      <Brand size="lg" />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Welcome back. Sign in to run visibility scans on your communities.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error === "callback" ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              We couldn&apos;t complete that confirmation link. Please try
              signing in or request a new link from sign up.
            </p>
          ) : null}
          <LoginForm next={safeNext} />
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
