import Link from "next/link";

import { AcceptInviteForm } from "@/components/invites/AcceptInviteForm";
import { Brand } from "@/components/layout/Brand";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = `/invite/${encodeURIComponent(token)}`;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6">
        <Brand size="lg" />
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Sign in to accept</CardTitle>
            <CardDescription>
              You need a signed-in account that matches the invited email.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button asChild>
              <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/signup?next=${encodeURIComponent(next)}`}>
                Create account
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6">
      <Brand size="lg" />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Accept invite</CardTitle>
          <CardDescription>
            You will be added as a member of the inviting organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AcceptInviteForm token={token} />
        </CardContent>
      </Card>
    </div>
  );
}
