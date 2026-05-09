import { SidebarContent } from "@/components/layout/SidebarContent";
import type { Company } from "@/types";

export function Sidebar({ companies }: { companies: Company[] }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-6 border-r border-border bg-muted/40 p-4 md:flex">
      <SidebarContent companies={companies} />
    </aside>
  );
}
