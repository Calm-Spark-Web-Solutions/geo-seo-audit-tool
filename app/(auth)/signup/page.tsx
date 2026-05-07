import Link from "next/link";

import { SignupForm } from "@/components/auth/SignupForm";
import { Brand } from "@/components/layout/Brand";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6">
      <Brand size="lg" />
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Create your account</CardTitle>
          <CardDescription>
            We&apos;ll email you a confirmation link to finish setup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm />
        </CardContent>
      </Card>
      <Link
        href="/"
        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        Back to home
      </Link>
    </div>
  );
}
