import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { Brand } from "@/components/layout/Brand";
import { ThemeToggleFixed } from "@/components/theme/ThemeToggleFixed";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ForgotPasswordPage() {
  return (
    <main
      id="main"
      className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6"
    >
      <ThemeToggleFixed />
      <Brand size="lg" />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            Enter the email you signed up with and we&apos;ll send you a link
            to set a new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
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
