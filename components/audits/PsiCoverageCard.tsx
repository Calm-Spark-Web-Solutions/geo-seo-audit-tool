import Link from "next/link";
import { Gauge } from "lucide-react";

import { RetryMissingPsiButton } from "@/components/audits/RetryMissingPsiButton";
import { hasPsiCategories } from "@/lib/audit/psi-keys";
import { createClient } from "@/lib/supabase/server";
import type { AuditCheck } from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PREVIEW_URL_COUNT = 5;

interface CoverageRow {
  id: string;
  url: string;
  seo_results: AuditCheck[] | null;
  geo_results: AuditCheck[] | null;
}

/**
 * Lighthouse coverage card for the scan overview. Mirrors the four-tile
 * empty-state predicate used by `LighthouseSection` so a page that shows
 * "no Lighthouse data" on the detail view is the same page that counts as
 * missing here.
 */
export async function PsiCoverageCard({ auditId }: { auditId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_pages")
    .select("id, url, seo_results, geo_results")
    .eq("audit_id", auditId);

  // On error or empty audit, hide the card — there's nothing useful to
  // show and the page list above already covers the empty case.
  if (error || !data || data.length === 0) return null;

  const rows = data as CoverageRow[];
  const missing: { id: string; url: string }[] = [];
  for (const row of rows) {
    const seo = row.seo_results ?? [];
    const geo = row.geo_results ?? [];
    if (!hasPsiCategories([...seo, ...geo])) {
      missing.push({ id: row.id, url: row.url });
    }
  }

  const total = rows.length;
  const covered = total - missing.length;
  const isHealthy = missing.length === 0;
  const firstMissingId = missing[0]?.id ?? null;
  const previewMissing = missing.slice(0, PREVIEW_URL_COUNT);
  const overflow = Math.max(0, missing.length - previewMissing.length);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-muted-foreground" aria-hidden />
            Lighthouse coverage
          </CardTitle>
          <CardDescription>
            {isHealthy
              ? `All ${total} page${total === 1 ? "" : "s"} have PageSpeed data.`
              : `${covered} of ${total} page${total === 1 ? "" : "s"} have PageSpeed data. ${missing.length} still missing — each retry pass processes up to 6 pages; click again if pages remain after the first pass.`}
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RetryMissingPsiButton
            auditId={auditId}
            missingCount={missing.length}
            variant={isHealthy ? "outline" : "default"}
          />
        </div>
      </CardHeader>
      {isHealthy ? null : (
        <CardContent className="flex flex-col gap-3 text-sm">
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {previewMissing.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span className="min-w-0 truncate text-muted-foreground">
                  {p.url}
                </span>
                <Link
                  href={`/visibility-scans/${auditId}/pages/${p.id}/inspectors/lighthouse`}
                  className="shrink-0 text-xs font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Open Lighthouse inspector
                </Link>
              </li>
            ))}
          </ul>
          {firstMissingId ? (
            <p className="text-xs text-muted-foreground">
              {overflow > 0
                ? `Showing ${previewMissing.length} of ${missing.length}. `
                : null}
              <Link
                href={`/visibility-scans/${auditId}/pages/${firstMissingId}/inspectors/lighthouse#missing-elsewhere`}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                View all missing pages in the Lighthouse inspector
              </Link>
            </p>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}
