import { Brand } from "@/components/layout/Brand";
import { MobileNavSheet } from "@/components/layout/MobileNavSheet";
import { UserMenu } from "@/components/layout/UserMenu";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/types";

export async function Topbar({ companies }: { companies: Company[] }) {
  const { email, fullName, avatarUrl } = await loadUser();

  return (
    <header className="sticky top-0 z-20 flex h-14 w-full items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <MobileNavSheet companies={companies} />
        <Brand size="md" />
      </div>
      <UserMenu email={email} fullName={fullName} avatarUrl={avatarUrl} />
    </header>
  );
}

async function loadUser() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { email: null, fullName: null, avatarUrl: null };
    }
    const meta = (user.user_metadata ?? {}) as {
      full_name?: string;
      name?: string;
      avatar_url?: string;
    };
    return {
      email: user.email ?? null,
      fullName: meta.full_name ?? meta.name ?? null,
      avatarUrl: meta.avatar_url ?? null,
    };
  } catch {
    return { email: null, fullName: null, avatarUrl: null };
  }
}
