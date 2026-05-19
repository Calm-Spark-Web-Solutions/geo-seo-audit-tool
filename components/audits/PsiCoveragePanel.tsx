"use client";

import Link from "next/link";

import { PsiBackfillPoller } from "@/components/audits/PsiBackfillPoller";
import { RetryMissingPsiButton } from "@/components/audits/RetryMissingPsiButton";
import { hasPsiCategories } from "@/lib/audit/psi-keys";
import type { AuditPage } from "@/types";

const PREVIEW_URL_COUNT = 5;

export function PsiCoveragePanel({
  auditId,
  pages,
}: {
  auditId: string;
  pages: AuditPage[];
}) {
  if (pages.length === 0) return null;

  const missing: { id: string; url: string }[] = [];
  for (const row of pages) {
    const seo = row.seo_results ?? [];
    const geo = row.geo_results ?? [];
    if (!hasPsiCategories([...seo, ...geo])) {
      missing.push({ id: row.id, url: row.url });
    }
  }

  if (missing.length === 0) return null;

  const total = pages.length;
  const covered = total - missing.length;
  const previewMissing = missing.slice(0, PREVIEW_URL_COUNT);
  const overflow = missing.length - previewMissing.length;
  const firstMissingId = missing[0]?.id ?? null;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <PsiBackfillPoller auditId={auditId} missingCount={missing.length} />
      <p className="text-xs text-muted-foreground">
        {covered} of {total} scored page{total === 1 ? "" : "s"} have PageSpeed
        data. Missing pages are retried in the background, or use Retry now.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <RetryMissingPsiButton auditId={auditId} missingCount={missing.length} />
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {previewMissing.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
          >
            <span className="min-w-0 truncate text-muted-foreground">{p.url}</span>
            <Link
              href={`/visibility-scans/${auditId}/pages/${p.id}/inspectors/lighthouse`}
              className="shrink-0 font-medium text-foreground underline-offset-4 hover:underline"
            >
              Inspector
            </Link>
          </li>
        ))}
      </ul>
      {firstMissingId && overflow > 0 ? (
        <p className="text-xs text-muted-foreground">
          +{overflow} more —{" "}
          <Link
            href={`/visibility-scans/${auditId}/pages/${firstMissingId}/inspectors/lighthouse#missing-elsewhere`}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            view all in Lighthouse inspector
          </Link>
        </p>
      ) : null}
    </div>
  );
}
