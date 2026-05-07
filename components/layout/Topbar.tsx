import Link from "next/link";

import { Brand } from "@/components/layout/Brand";
import { UserMenu } from "@/components/layout/UserMenu";
import { createClient } from "@/lib/supabase/server";

export async function Topbar() {
  const { email, fullName, avatarUrl } = await loadUser();

  return (
    <header className="sticky top-0 z-20 flex h-14 w-full items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-6">
        <Brand size="md" />
        <nav className="flex items-center gap-4 text-sm md:hidden">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground"
          >
            Dashboard
          </Link>
          <Link
            href="/companies"
            className="text-muted-foreground hover:text-foreground"
          >
            Organizations
          </Link>
        </nav>
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
