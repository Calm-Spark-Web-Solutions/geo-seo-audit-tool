import { CheckCircle2, Tag, XCircle } from "lucide-react";

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

// Schema types by importance tier for local service / senior-care niche
const TIER_HIGH = new Set([
  "LocalBusiness", "Organization", "Service", "ProfessionalService",
  "MedicalBusiness", "LodgingBusiness", "HomeAndConstructionBusiness",
]);
const TIER_CONTENT = new Set([
  "FAQPage", "QAPage", "HowTo", "Article", "BlogPosting", "NewsArticle",
  "Event", "Review", "AggregateRating",
]);
const TIER_STRUCTURE = new Set([
  "WebSite", "WebPage", "AboutPage", "ContactPage",
  "BreadcrumbList", "SiteLinksSearchBox", "ItemList",
]);

const CHIP_CLASSES: Record<"high" | "content" | "structure" | "other", string> = {
  high:      "border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  content:   "border-blue-500/40 bg-blue-500/10 text-blue-800 dark:text-blue-300",
  structure: "border-violet-500/40 bg-violet-500/10 text-violet-800 dark:text-violet-300",
  other:     "border-border bg-muted/30 text-foreground",
};

const LEGEND = [
  { tier: "high" as const,      label: "High value",           desc: "Business identity & service signals" },
  { tier: "content" as const,   label: "Content enrichment",   desc: "FAQs, articles, reviews" },
  { tier: "structure" as const, label: "Structure",            desc: "Site navigation & page types" },
  { tier: "other" as const,     label: "Other",                desc: "All other detected types" },
];

// Types AI assistants and local-SEO rankings reward most
const KEY_NICHE_TYPES: { type: string; label: string }[] = [
  { type: "LocalBusiness",       label: "LocalBusiness" },
  { type: "Organization",        label: "Organization" },
  { type: "Service",             label: "Service / ProfessionalService" },
  { type: "FAQPage",             label: "FAQPage" },
  { type: "BreadcrumbList",      label: "BreadcrumbList" },
  { type: "AggregateRating",     label: "AggregateRating (reviews)" },
];

function tierOf(t: string): "high" | "content" | "structure" | "other" {
  if (TIER_HIGH.has(t)) return "high";
  if (TIER_CONTENT.has(t)) return "content";
  if (TIER_STRUCTURE.has(t)) return "structure";
  return "other";
}

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
  const detectedTypeSet = new Set(schemaItems.map((s) => s.schemaType));

  // Check Service/ProfessionalService as a combined key
  const hasService = detectedTypeSet.has("Service") || detectedTypeSet.has("ProfessionalService");

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
        <>
          {/* Detected types with color-coded tiers */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Detected schema @types</CardTitle>
              <CardDescription>
                Color indicates importance tier for local service and senior-care businesses.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-wrap gap-2">
                {[...schemaItems]
                  .sort((a, b) => {
                    const ta = tierOf(a.schemaType);
                    const tb = tierOf(b.schemaType);
                    const order = { high: 0, content: 1, structure: 2, other: 3 };
                    if (order[ta] !== order[tb]) return order[ta] - order[tb];
                    return a.schemaType.localeCompare(b.schemaType);
                  })
                  .map((s) => {
                    const tier = tierOf(s.schemaType);
                    return (
                      <li key={s.schemaType}>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium ${CHIP_CLASSES[tier]}`}
                        >
                          <Tag className="h-3.5 w-3.5 opacity-70" aria-hidden />
                          <span className="font-mono">{s.schemaType}</span>
                        </span>
                      </li>
                    );
                  })}
              </ul>

              {/* Legend */}
              <ul className="flex flex-wrap gap-3">
                {LEGEND.map(({ tier, label, desc }) => (
                  <li key={tier} className="flex items-center gap-1.5 text-xs">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${CHIP_CLASSES[tier]}`}
                    >
                      {label}
                    </span>
                    <span className="text-muted-foreground">{desc}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Key types gap analysis */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Key types for local service businesses</CardTitle>
              <CardDescription>
                High-impact schema types that AI assistants and local-search rankings reward most.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                {KEY_NICHE_TYPES.map(({ type, label }) => {
                  const present =
                    type === "Service"
                      ? hasService
                      : detectedTypeSet.has(type);
                  return (
                    <li
                      key={type}
                      className="flex items-center gap-3 px-3 py-2.5 text-sm"
                    >
                      {present ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500" aria-hidden />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
                      )}
                      <span
                        className={`font-mono font-medium ${present ? "text-foreground" : "text-muted-foreground"}`}
                      >
                        {label}
                      </span>
                      {!present && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          not detected
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </>
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
