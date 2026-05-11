import { Tag } from "lucide-react";

import { InspectorHeader } from "@/components/audits/InspectorHeader";
import { PageDetailNav } from "@/components/audits/PageDetailNav";
import { EmptyState } from "@/components/layout/EmptyState";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { findInspectorEvidence, loadInspectorContext } from "@/lib/audit/inspector";
import type { AuditCheck, AuditCheckEvidenceItem } from "@/types";

export const dynamic = "force-dynamic";

const PREFERRED_SCHEMA_KEYS = [
  "structured_data_coverage",
  "schema_organization_family",
  "schema_website",
  "schema_service_faq",
  "schema_article",
  "schema_item_list",
  "schema_nap_signals",
];

function relatedSchemaChecks(checks: AuditCheck[]): AuditCheck[] {
  return checks.filter(
    (c) => c.key === "json_ld" || c.key === "json_ld_syntax" || c.key.startsWith("schema_") || c.key === "structured_data_coverage",
  );
}

export default async function SchemaInspectorPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id: auditId, pageId } = await params;
  const ctx = await loadInspectorContext({ auditId, pageId });
  const match = findInspectorEvidence(ctx.checks, "schema", PREFERRED_SCHEMA_KEYS);

  const schemaItems: Extract<AuditCheckEvidenceItem, { type: "schema" }>[] =
    match?.evidence.items.filter(
      (i): i is Extract<AuditCheckEvidenceItem, { type: "schema" }> =>
        i.type === "schema",
    ) ?? [];
  const totalTypes = match?.evidence.totalCount ?? schemaItems.length;
  const related = relatedSchemaChecks(ctx.checks);

  return (
    <>
      <PageDetailNav auditId={auditId} pageId={pageId} />

      <InspectorHeader
        auditId={auditId}
        pageId={pageId}
        pageUrl={ctx.page.url}
        title="Structured data"
        description={
          <span>
            {totalTypes} unique @type{totalTypes === 1 ? "" : "s"} detected
          </span>
        }
      />

      {schemaItems.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No structured data detected"
          description="JSON-LD blocks were not detected, or this audit ran before schema sampling shipped."
        />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Detected schema @types</CardTitle>
            <CardDescription>
              Each chip represents a Schema.org type the scan found in a
              JSON-LD block on this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {[...schemaItems]
                .sort((a, b) => a.schemaType.localeCompare(b.schemaType))
                .map((s) => (
                  <li key={s.schemaType}>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-sm">
                      <Tag className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      <span className="font-mono">{s.schemaType}</span>
                    </span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {related.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Related checks</CardTitle>
            <CardDescription>
              How each structured-data signal scored on this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {related.map((c) => (
                <li key={c.key} className="flex flex-col gap-1 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        c.result === "pass"
                          ? "inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                          : c.result === "warn"
                            ? "inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
                            : "inline-flex items-center rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
                      }
                    >
                      {c.result}
                    </span>
                    <span className="font-medium">{c.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.explanation}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
