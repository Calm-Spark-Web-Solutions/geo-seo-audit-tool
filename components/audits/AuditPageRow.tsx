import { ExternalLink } from "lucide-react";

import { CheckList } from "@/components/audits/CheckList";
import type { AuditCheck, AuditPage, FixItem } from "@/types";

export function AuditPageRow({ page }: { page: AuditPage }) {
  const seo = (page.seo_results ?? []) as AuditCheck[];
  const geo = (page.geo_results ?? []) as AuditCheck[];
  const fixes = (page.fixes ?? []) as FixItem[];

  return (
    <details className="group border-b border-border last:border-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 pr-1 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <a
            href={page.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 truncate text-sm font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="truncate">{page.url}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </a>
          <span className="text-xs text-muted-foreground">
            {fixes.length} suggested fix{fixes.length === 1 ? "" : "es"}
          </span>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {page.score ?? "—"}
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-border bg-muted/20 px-1 py-4 sm:px-3">
        {page.ai_comment ? (
          <div className="rounded-md border border-border bg-card px-3 py-2 text-sm">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              AI commentary
            </h4>
            <p className="whitespace-pre-wrap text-foreground">{page.ai_comment}</p>
          </div>
        ) : null}
        <div className="grid gap-6 md:grid-cols-2">
          <CheckList title="SEO checks" checks={seo} />
          <CheckList title="GEO checks" checks={geo} />
        </div>
        {fixes.length > 0 ? (
          <div>
            <h4 className="mb-2 text-sm font-semibold">Suggested fixes</h4>
            <ul className="flex flex-col gap-2 text-sm">
              {fixes.map((f, i) => (
                <li
                  key={`${f.title}-${i}`}
                  className="rounded-md border border-border bg-card px-3 py-2"
                >
                  <span className="font-medium capitalize text-muted-foreground">
                    [{f.priority}]{" "}
                  </span>
                  {f.title}
                  <p className="text-muted-foreground">{f.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}
