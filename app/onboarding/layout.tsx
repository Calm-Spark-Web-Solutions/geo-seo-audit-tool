import type { ReactNode } from "react";

import { ThemeToggleFixed } from "@/components/theme/ThemeToggleFixed";

export const dynamic = "force-dynamic";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <main
      id="main"
      className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6"
    >
      <ThemeToggleFixed />
      {children}
    </main>
  );
}
