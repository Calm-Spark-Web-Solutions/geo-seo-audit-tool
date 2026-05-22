import { ThemeToggle } from "@/components/theme/ThemeToggle";

/** Consistent top-right placement for auth + onboarding entry pages. */
export function ThemeToggleFixed() {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 md:right-6 md:top-6">
      <div className="pointer-events-auto">
        <ThemeToggle />
      </div>
    </div>
  );
}
