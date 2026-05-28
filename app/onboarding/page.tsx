import { redirect } from "next/navigation";

import { signOut } from "@/app/(dashboard)/auth-actions";
import { CompanyForm } from "@/components/companies/CompanyForm";
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

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { count } = await supabase
    .from("company_members")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count ?? 0) > 0) redirect("/dashboard");

  const metadata =
    (user.user_metadata as
      | { full_name?: string | null; name?: string | null }
      | undefined) ?? {};
  const contactName = metadata.full_name ?? metadata.name ?? null;

  return (
    <>
      <Brand size="lg" />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Welcome — let&apos;s set up your first organization</CardTitle>
          <CardDescription>
            An organization is the company or brand that owns the community
            websites you&apos;ll track. We&apos;ll add your first community
            right after this, then run a visibility scan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompanyForm
            defaults={{
              contact_name: contactName,
              contact_email: user.email ?? null,
            }}
          />
        </CardContent>
      </Card>
      <form action={signOut}>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Sign out
        </Button>
      </form>
    </>
  );
}
