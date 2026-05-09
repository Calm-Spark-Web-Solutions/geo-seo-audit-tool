import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import {
  GEO_SECTION_DESCRIPTION,
  GEO_SECTION_TITLE,
  SEO_SECTION_DESCRIPTION,
  SEO_SECTION_TITLE,
} from "@/lib/audit/reader-copy";
import { mapNearDuplicateChecksForDisplay } from "@/lib/scoring/near-duplicate-display";
import type {
  Audit,
  AuditCheck,
  AuditPage,
  CheckResult,
  Community,
  Company,
  FixItem,
  ManualChecklistPdfRow,
  ManualVerificationStatus,
} from "@/types";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    paddingBottom: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#111111",
    lineHeight: 1.4,
  },
  hero: {
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingBottom: 12,
    marginBottom: 16,
  },
  eyebrow: {
    fontSize: 9,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  title: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    marginTop: 4,
  },
  metaRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
    fontSize: 10,
    color: "#374151",
  },
  scoreRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  scoreCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 4,
    padding: 8,
  },
  scoreLabel: {
    fontSize: 8,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },
  scoreValue: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginTop: 12,
    marginBottom: 6,
  },
  pageBlock: {
    flexGrow: 1,
    marginBottom: 0,
    paddingBottom: 0,
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  pageUrl: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    flexShrink: 1,
  },
  pageScore: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  twoColumn: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  column: {
    flex: 1,
  },
  checkBlock: {
    marginBottom: 6,
  },
  checkLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  checkSubtitle: {
    fontSize: 8,
    color: "#6B7280",
    marginBottom: 4,
    lineHeight: 1.35,
  },
  checkExplanation: {
    color: "#374151",
    fontSize: 9,
  },
  resultGlyph: {
    fontFamily: "Helvetica-Bold",
    marginRight: 4,
  },
  glyphPass: { color: "#16A34A" },
  glyphWarn: { color: "#D97706" },
  glyphFail: { color: "#DC2626" },
  aiBlock: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 4,
    padding: 8,
    marginTop: 6,
    marginBottom: 8,
  },
  aiHeading: {
    fontSize: 8,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 3,
  },
  aiBody: {
    fontSize: 10,
    color: "#111111",
  },
  fixesList: {
    marginTop: 6,
  },
  fixItem: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 2,
  },
  fixPriority: {
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    fontSize: 9,
    width: 56,
  },
  fixTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    flexShrink: 1,
  },
  fixDetail: {
    fontSize: 9,
    color: "#374151",
    marginLeft: 56,
    marginBottom: 6,
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    fontSize: 8,
    color: "#9CA3AF",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

function safeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function PdfFooter({ generated }: { generated: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>Generated {generated}</Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} / ${totalPages}`
        }
      />
    </View>
  );
}

function resultGlyph(result: CheckResult): string {
  if (result === "pass") return "OK";
  if (result === "warn") return "!";
  return "X";
}

function resultStyle(result: CheckResult) {
  if (result === "pass") return styles.glyphPass;
  if (result === "warn") return styles.glyphWarn;
  return styles.glyphFail;
}

function checksByCategory(checks: AuditCheck[]): {
  category: string;
  items: AuditCheck[];
}[] {
  const order: string[] = [];
  const map = new Map<string, AuditCheck[]>();
  for (const c of checks) {
    const cat = c.category?.trim() || "General";
    if (!map.has(cat)) {
      map.set(cat, []);
      order.push(cat);
    }
    map.get(cat)!.push(c);
  }
  return order.map((category) => ({
    category,
    items: map.get(category) ?? [],
  }));
}

function CheckItem({ check }: { check: AuditCheck }) {
  const label = safeText(check.label);
  const explanation = safeText(check.explanation);
  return (
    <View style={styles.checkBlock}>
      <Text style={styles.checkLabel}>
        <Text style={[styles.resultGlyph, resultStyle(check.result)]}>
          {resultGlyph(check.result)}
        </Text>
        {"  "}
        {label}
      </Text>
      <Text style={styles.checkExplanation}>{explanation}</Text>
    </View>
  );
}

function CheckColumn({
  pillarTitle,
  pillarDescription,
  checks,
}: {
  pillarTitle: string;
  pillarDescription: string;
  checks: AuditCheck[];
}) {
  const grouped = checksByCategory(checks);
  const multi = grouped.length > 1 || (grouped[0]?.category ?? "") !== "General";
  return (
    <View style={styles.column}>
      <Text style={styles.checkLabel}>{pillarTitle}</Text>
      <Text style={styles.checkSubtitle}>{pillarDescription}</Text>
      {checks.length === 0 ? (
        <Text style={styles.checkExplanation}>No checks recorded.</Text>
      ) : (
        grouped.map(({ category, items }) => (
          <View key={category} wrap>
            {multi ? (
              <Text style={styles.checkSubtitle}>{category}</Text>
            ) : null}
            {items.map((c) => (
              <CheckItem key={c.key} check={c} />
            ))}
          </View>
        ))
      )}
    </View>
  );
}

function PageBlock({ page }: { page: AuditPage }) {
  const seo = (page.seo_results ?? []) as AuditCheck[];
  const geo = (page.geo_results ?? []) as AuditCheck[];
  const fixes = (page.fixes ?? []) as FixItem[];
  const url = safeText(page.url);

  return (
    <View style={styles.pageBlock} wrap>
      <View style={styles.pageHeader} wrap={false}>
        <Text style={styles.pageUrl}>{url}</Text>
        <Text style={styles.pageScore}>
          {page.score != null ? `${page.score}` : "—"}
        </Text>
      </View>

      {page.ai_comment ? (
        <View style={styles.aiBlock}>
          <Text style={styles.aiHeading}>AI commentary</Text>
          <Text style={styles.aiBody}>{safeText(page.ai_comment)}</Text>
        </View>
      ) : null}

      <View style={styles.twoColumn} wrap>
        <CheckColumn
          pillarTitle={SEO_SECTION_TITLE}
          pillarDescription={SEO_SECTION_DESCRIPTION}
          checks={seo}
        />
        <CheckColumn
          pillarTitle={GEO_SECTION_TITLE}
          pillarDescription={GEO_SECTION_DESCRIPTION}
          checks={geo}
        />
      </View>

      {fixes.length > 0 ? (
        <View style={styles.fixesList}>
          <Text style={styles.checkLabel}>Suggested fixes</Text>
          {fixes.map((fix, i) => (
            <View key={`${safeText(fix.title)}-${i}`}>
              <View style={styles.fixItem}>
                <Text style={styles.fixPriority}>[{safeText(fix.priority)}]</Text>
                <Text style={styles.fixTitle}>{safeText(fix.title)}</Text>
              </View>
              <Text style={styles.fixDetail}>{safeText(fix.detail)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function manualGlyph(status: ManualVerificationStatus): string {
  if (status === "pass") return "OK";
  if (status === "warn") return "!";
  if (status === "fail") return "X";
  return "•";
}

function manualGlyphStyle(status: ManualVerificationStatus) {
  if (status === "pass") return styles.glyphPass;
  if (status === "warn") return styles.glyphWarn;
  if (status === "fail") return styles.glyphFail;
  return styles.checkExplanation;
}

function manualRowsByCategory(rows: ManualChecklistPdfRow[]): {
  category: string;
  items: ManualChecklistPdfRow[];
}[] {
  const order: string[] = [];
  const map = new Map<string, ManualChecklistPdfRow[]>();
  for (const r of rows) {
    if (!map.has(r.category)) {
      map.set(r.category, []);
      order.push(r.category);
    }
    map.get(r.category)!.push(r);
  }
  return order.map((category) => ({
    category,
    items: map.get(category) ?? [],
  }));
}

export interface AuditReportPdfProps {
  audit: Audit;
  community: Community | null;
  company: Company | null;
  pages: AuditPage[];
  siteWideChecks: AuditCheck[];
  cruxFieldChecks: AuditCheck[];
  nearDuplicateChecks: AuditCheck[];
  manualChecklistRows: ManualChecklistPdfRow[];
}

export function AuditReportPdfDocument({
  audit,
  community,
  company,
  pages,
  siteWideChecks,
  cruxFieldChecks,
  nearDuplicateChecks,
  manualChecklistRows,
}: AuditReportPdfProps) {
  const nearDupForPdf = mapNearDuplicateChecksForDisplay(nearDuplicateChecks);
  const generated = new Date().toLocaleString();
  const auditDate = new Date(audit.created_at).toLocaleString();

  const companyName = safeText(company?.name);
  const communityName = safeText(community?.name || "Community");
  const websiteUrl = safeText(community?.website_url);
  const facilityType = safeText(community?.facility_type);

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>SEO &amp; GEO Audit</Text>
          <Text style={styles.title}>
            {communityName}
            {company?.name ? ` — ${companyName}` : ""}
          </Text>
          <View style={styles.metaRow}>
            <Text>Status: {safeText(audit.status)}</Text>
            <Text>Audit run: {auditDate}</Text>
            <Text>Pages: {audit.pages_crawled}</Text>
          </View>
          {websiteUrl ? (
            <Text style={{ marginTop: 4, color: "#374151" }}>
              {websiteUrl}
            </Text>
          ) : null}
          {facilityType ? (
            <Text style={{ marginTop: 6, fontSize: 10, color: "#374151" }}>
              Facility type: {facilityType}
            </Text>
          ) : null}
        </View>

        <View style={styles.scoreRow} wrap={false}>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>Overall</Text>
            <Text style={styles.scoreValue}>{audit.score ?? "—"}</Text>
          </View>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>SEO</Text>
            <Text style={styles.scoreValue}>{audit.seo_score ?? "—"}</Text>
          </View>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>GEO</Text>
            <Text style={styles.scoreValue}>{audit.geo_score ?? "—"}</Text>
          </View>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>Pages</Text>
            <Text style={styles.scoreValue}>{audit.pages_crawled}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Per-page results</Text>
        {pages.length === 0 ? (
          <Text style={styles.checkExplanation}>
            No page results were recorded for this audit.
          </Text>
        ) : (
          <Text style={styles.checkExplanation}>
            Detailed SEO and GEO checks for each audited URL appear on the following sheets (
            {pages.length} URL{pages.length === 1 ? "" : "s"}).
          </Text>
        )}

        {siteWideChecks.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Site-wide probes (automated)</Text>
            <Text style={styles.checkSubtitle}>
              Origin-level crawl signals (robots.txt, AI bot rules, sitemap discovery). Empty automated sections mean no rows were recorded — unlike the expert checklist.
            </Text>
            <View>{siteWideChecks.map((c) => <CheckItem key={c.key} check={c} />)}</View>
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Site-wide probes (automated)</Text>
            <Text style={styles.checkExplanation}>No site-wide checks recorded.</Text>
          </>
        )}

        {cruxFieldChecks.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Field metrics (automated · Chrome UX Report)</Text>
            <Text style={styles.checkSubtitle}>
              Origin-level CrUX cohort p75 metrics when available. Missing without API keys, disabled API, or low traffic coverage.
            </Text>
            <View>{cruxFieldChecks.map((c) => <CheckItem key={c.key} check={c} />)}</View>
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Field metrics (automated · Chrome UX Report)</Text>
            <Text style={styles.checkExplanation}>
              No CrUX rows stored (unset API keys, insufficient traffic dataset, or engine before v4).
            </Text>
          </>
        )}

        {nearDuplicateChecks.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Similar pages (this audit)</Text>
            <Text style={styles.checkSubtitle}>
              Overlap in visible text between URLs fetched in this run—often shared templates, not automatically a Google duplicate penalty. Optional
              server caps apply (AUDIT_NEAR_DUP_*).
            </Text>
            <View>{nearDupForPdf.map((c) => <CheckItem key={c.key} check={c} />)}</View>
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Similar pages (this audit)</Text>
            <Text style={styles.checkExplanation}>
              Not computed (fewer than two pages fetched, AUDIT_NEAR_DUP_MAX_PAGES=0, or pre-v4 audit).
            </Text>
          </>
        )}

        <PdfFooter generated={generated} />
      </Page>

      {pages.map((p) => (
        <Page key={p.id} size="A4" style={styles.page} wrap>
          <PageBlock page={p} />
          <PdfFooter generated={generated} />
        </Page>
      ))}

      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.sectionTitle}>Expert checklist (human sign-off)</Text>
        <Text style={styles.checkSubtitle}>
          Human-reviewed items for &ldquo;{communityName}&rdquo; — not produced by automated scoring. Shared across audits until edited on the community page.
          Re-saving trims checklist keys retired from the current template (see README).
        </Text>
        {manualChecklistRows.length === 0 ? (
          <Text style={styles.checkExplanation}>No manual checklist template rows.</Text>
        ) : (
          manualRowsByCategory(manualChecklistRows).map(({ category, items }) => (
            <View key={category} style={{ marginTop: 8 }} wrap>
              <Text style={styles.checkSubtitle}>{category}</Text>
              {items.map((row) => (
                <View key={row.key} style={styles.checkBlock} wrap>
                  <Text style={styles.checkLabel}>
                    <Text style={[styles.resultGlyph, manualGlyphStyle(row.status)]}>
                      {manualGlyph(row.status)}
                    </Text>
                    {"  "}
                    {safeText(row.label)}
                  </Text>
                  {row.helper ? (
                    <Text style={styles.checkExplanation}>{safeText(row.helper)}</Text>
                  ) : null}
                  <Text style={styles.checkExplanation}>
                    Status: {safeText(row.status)}
                    {row.notes ? ` — ${safeText(row.notes)}` : ""}
                  </Text>
                </View>
              ))}
            </View>
          ))
        )}
        <PdfFooter generated={generated} />
      </Page>
    </Document>
  );
}
