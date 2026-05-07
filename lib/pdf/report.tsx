import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type {
  Audit,
  AuditCheck,
  AuditPage,
  CheckResult,
  Community,
  Company,
  FixItem,
} from "@/types";

const styles = StyleSheet.create({
  page: {
    padding: 36,
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
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 6,
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
    marginBottom: 4,
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

function CheckItem({ check }: { check: AuditCheck }) {
  return (
    <View style={styles.checkBlock} wrap={false}>
      <Text style={styles.checkLabel}>
        <Text style={[styles.resultGlyph, resultStyle(check.result)]}>
          {resultGlyph(check.result)}
        </Text>
        {"  "}
        {check.label}
      </Text>
      <Text style={styles.checkExplanation}>{check.explanation}</Text>
    </View>
  );
}

function PageBlock({ page }: { page: AuditPage }) {
  const seo = (page.seo_results ?? []) as AuditCheck[];
  const geo = (page.geo_results ?? []) as AuditCheck[];
  const fixes = (page.fixes ?? []) as FixItem[];

  return (
    <View style={styles.pageBlock} wrap>
      <View style={styles.pageHeader}>
        <Text style={styles.pageUrl}>{page.url}</Text>
        <Text style={styles.pageScore}>
          {page.score != null ? `${page.score}` : "—"}
        </Text>
      </View>

      {page.ai_comment ? (
        <View style={styles.aiBlock} wrap={false}>
          <Text style={styles.aiHeading}>AI commentary</Text>
          <Text style={styles.aiBody}>{page.ai_comment}</Text>
        </View>
      ) : null}

      <View style={styles.twoColumn}>
        <View style={styles.column}>
          <Text style={styles.checkLabel}>SEO checks</Text>
          {seo.length === 0 ? (
            <Text style={styles.checkExplanation}>No SEO checks recorded.</Text>
          ) : (
            seo.map((c) => <CheckItem key={c.key} check={c} />)
          )}
        </View>
        <View style={styles.column}>
          <Text style={styles.checkLabel}>GEO checks</Text>
          {geo.length === 0 ? (
            <Text style={styles.checkExplanation}>No GEO checks recorded.</Text>
          ) : (
            geo.map((c) => <CheckItem key={c.key} check={c} />)
          )}
        </View>
      </View>

      {fixes.length > 0 ? (
        <View style={styles.fixesList} wrap>
          <Text style={styles.checkLabel}>Suggested fixes</Text>
          {fixes.map((fix, i) => (
            <View key={`${fix.title}-${i}`} wrap={false}>
              <View style={styles.fixItem}>
                <Text style={styles.fixPriority}>[{fix.priority}]</Text>
                <Text style={styles.fixTitle}>{fix.title}</Text>
              </View>
              <Text style={styles.fixDetail}>{fix.detail}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export interface AuditReportPdfProps {
  audit: Audit;
  community: Community | null;
  company: Company | null;
  pages: AuditPage[];
}

export function AuditReportPdfDocument({
  audit,
  community,
  company,
  pages,
}: AuditReportPdfProps) {
  const generated = new Date().toLocaleString();
  const auditDate = new Date(audit.created_at).toLocaleString();

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>SEO &amp; GEO Audit</Text>
          <Text style={styles.title}>
            {community?.name ?? "Community"}
            {company ? ` — ${company.name}` : ""}
          </Text>
          <View style={styles.metaRow}>
            <Text>Status: {audit.status}</Text>
            <Text>Audit run: {auditDate}</Text>
            <Text>Pages: {audit.pages_crawled}</Text>
          </View>
          {community?.website_url ? (
            <Text style={{ marginTop: 4, color: "#374151" }}>
              {community.website_url}
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
          pages.map((p) => <PageBlock key={p.id} page={p} />)
        )}

        <View style={styles.footer} fixed>
          <Text>Generated {generated}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
