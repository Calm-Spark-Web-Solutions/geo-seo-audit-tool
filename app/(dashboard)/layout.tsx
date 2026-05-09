import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/types";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { count: memberCount } = await supabase
    .from("company_members")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((memberCount ?? 0) === 0) redirect("/onboarding");

  const { data, error } = await supabase
    .from("companies")
    .select("id, user_id, name, logo_url, contact_name, contact_email, created_at")
    .order("name", { ascending: true });
  if (error) {
    console.warn("[dashboard] failed to load companies:", error.message);
  }
  const companies = (data ?? []) as Company[];

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr] bg-background">
      <Topbar companies={companies} />
      <div className="grid grid-cols-1 md:grid-cols-[15rem_1fr]">
        <Sidebar companies={companies} />
        <main id="main" className="min-w-0 p-4 md:p-8">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
