import Link from "next/link";
import { redirect } from "next/navigation";

import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Brand } from "@/components/layout/Brand";
import { ThemeToggleFixed } from "@/components/theme/ThemeToggleFixed";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password");

  return (
    <main
      id="main"
      className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6"
    >
      <ThemeToggleFixed />
      <Brand size="lg" />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>
            Choose a new password for{" "}
            <span className="font-medium text-foreground">{user.email}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm />
        </CardContent>
      </Card>
      <Link
        href="/dashboard"
        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        Skip for now
      </Link>
    </main>
  );
}
