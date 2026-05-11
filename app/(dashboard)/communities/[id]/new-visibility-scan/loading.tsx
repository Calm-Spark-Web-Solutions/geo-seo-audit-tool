import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Suspense fallback for the new-visibility-scan route segment. Renders while the
 * server-side `fetchSitemapShards` call resolves so the user sees
 * immediate feedback instead of a blank page after clicking
 * "Run new visibility scan". Layout mirrors `page.tsx` so the form lands without
 * a visible jump.
 */
export default function Loading() {
  return (
    <>
      <PageHeader
        title="Run new visibility scan"
        description={
          <span className="text-muted-foreground">
            Pick which sitemap categories to include and how many URLs to
            crawl. Each page is scored with deterministic checks plus PSI
            and Anthropic commentary, so larger runs take proportionally
            longer.
          </span>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fetching sitemap…</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 py-6">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </CardContent>
      </Card>
    </>
  );
}
