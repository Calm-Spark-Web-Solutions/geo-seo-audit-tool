import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BillingUsageCard } from "@/components/billing/BillingUsageCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { getActiveOrgCookie } from "@/lib/active-org-cookie";
import { loadBillingUsageSnapshot } from "@/lib/billing/usage-snapshot";
import { resolveDashboardOrgId } from "@/lib/layout/resolve-dashboard-org";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const orgParam = typeof sp.org === "string" ? sp.org : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: companies }, cookieOrgId] = await Promise.all([
    supabase.from("companies").select("id, name").order("name", { ascending: true }),
    getActiveOrgCookie(),
  ]);

  const companyList = (companies ?? []) as { id: string; name: string }[];
  if (companyList.length === 0) {
    redirect("/onboarding");
  }

  const orgId = resolveDashboardOrgId(companyList, orgParam, cookieOrgId);
  if (!orgId) notFound();

  if (orgParam && orgParam !== orgId) {
    redirect(`/usage?org=${encodeURIComponent(orgId)}`);
  }

  const activeCompany = companyList.find((c) => c.id === orgId);
  if (!activeCompany) notFound();

  const snapshot = await loadBillingUsageSnapshot(supabase, user.id, {
    companyId: orgId,
    companyName: activeCompany.name,
  });
  if (!snapshot) notFound();

  return (
    <>
      <PageHeader
        title="Usage"
        description={
          <>
            Page and scan usage for{" "}
            <span className="font-medium text-foreground">
              {activeCompany.name}
            </span>
            . Plan limits apply to your whole account; rescans of tracked URLs
            are free.
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings?tab=billing">Change plan</Link>
        </Button>
      </div>

      <BillingUsageCard snapshot={snapshot} />
    </>
  );
}
