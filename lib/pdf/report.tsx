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
import { categoryLabelSortKey } from "@/lib/crawler/shard-labels";
import type {
  Audit,
  AuditCheck,
  AuditCheckEvidence,
  AuditCheckEvidenceItem,
  AuditPage,
  CheckResult,
  Community,
  Company,
  FixItem,
  FixPriority,
} from "@/types";

// --- Design tokens ----------------------------------------------------------

const tokens = {
  color: {
    ink: "#0F172A",
    inkSoft: "#1E293B",
    muted: "#475569",
    subtle: "#94A3B8",
    divider: "#E2E8F0",
    surface: "#F8FAFC",
    surfaceAlt: "#F1F5F9",
    pass: "#15803D",
    passBg: "#DCFCE7",
    warn: "#B45309",
    warnBg: "#FEF3C7",
    fail: "#B91C1C",
    failBg: "#FEE2E2",
    accent: "#1D4ED8",
    accentBg: "#DBEAFE",
    white: "#FFFFFF",
  },
  font: {
    xs: 8,
    sm: 9,
    base: 10,
    md: 11,
    lg: 12,
    xl: 14,
    display: 18,
    hero: 24,
  },
  space: {
    s2: 2,
    s4: 4,
    s6: 6,
    s8: 8,
    s12: 12,
    s16: 16,
    s24: 24,
    s32: 32,
  },
} as const;

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 48,
    paddingHorizontal: 44,
    fontFamily: "Helvetica",
    fontSize: tokens.font.base,
    color: tokens.color.ink,
    lineHeight: 1.45,
  },
  // Running page header (absolute top of each `<Page>`).
  // Do not use `fixed` here — it repeats on wrap fragments and triggers @react-pdf/pdfkit
  // transform bugs with long paginated content. Hairline rule is a filled View, not a border.
  runningHeader: {
    position: "absolute",
    top: 24,
    left: 44,
    right: 44,
    flexDirection: "column",
  },
  runningHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: tokens.font.xs,
    color: tokens.color.subtle,
  },
  runningHeaderHairline: {
    height: 0.5,
    width: "100%",
    backgroundColor: tokens.color.divider,
    marginTop: 6,
  },
  runningHeaderLeft: {
    fontFamily: "Helvetica-Bold",
    color: tokens.color.muted,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 44,
    right: 44,
    flexDirection: "column",
  },
  footerHairline: {
    height: 0.5,
    width: "100%",
    backgroundColor: tokens.color.divider,
    marginBottom: 6,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: tokens.font.xs,
    color: tokens.color.subtle,
  },

  // Section heading (cover bookmark target).
  sectionHeading: {
    marginTop: tokens.space.s24,
    marginBottom: tokens.space.s12,
  },
  sectionHeadingFirst: {
    marginTop: 0,
  },
  sectionEyebrow: {
    fontSize: tokens.font.xs,
    color: tokens.color.subtle,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: tokens.font.display,
    fontFamily: "Helvetica-Bold",
    color: tokens.color.ink,
    lineHeight: 1.2,
  },
  sectionDescription: {
    marginTop: tokens.space.s8,
    fontSize: tokens.font.sm,
    color: tokens.color.muted,
    lineHeight: 1.4,
  },
  divider: {
    marginTop: tokens.space.s8,
    height: 0.5,
    width: "100%",
    backgroundColor: tokens.color.divider,
  },

  // Cover hero.
  hero: {
    marginBottom: tokens.space.s16,
  },
  heroEyebrow: {
    fontSize: tokens.font.sm,
    color: tokens.color.accent,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: tokens.font.hero,
    fontFamily: "Helvetica-Bold",
    color: tokens.color.ink,
    lineHeight: 1.15,
  },
  heroSubtitle: {
    marginTop: tokens.space.s6,
    fontSize: tokens.font.lg,
    color: tokens.color.muted,
    lineHeight: 1.3,
  },
  metaGrid: {
    flexDirection: "row",
    marginTop: tokens.space.s12,
  },
  metaItem: {
    flex: 1,
  },
  metaItemSpaced: {
    flex: 1,
    marginLeft: tokens.space.s16,
  },
  metaLabel: {
    fontSize: tokens.font.xs,
    color: tokens.color.subtle,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  metaValue: {
    marginTop: 2,
    fontSize: tokens.font.sm,
    color: tokens.color.ink,
  },
  heroWebsite: {
    marginTop: tokens.space.s8,
    fontSize: tokens.font.sm,
    color: tokens.color.accent,
  },

  // Score band.
  scoreRow: {
    flexDirection: "row",
    marginTop: tokens.space.s8,
  },
  scoreCard: {
    flex: 1,
    padding: tokens.space.s8,
    backgroundColor: tokens.color.surface,
    alignItems: "center",
  },
  scoreCardSpaced: {
    flex: 1,
    marginLeft: tokens.space.s8,
    padding: tokens.space.s8,
    backgroundColor: tokens.color.surface,
    alignItems: "center",
  },
  scoreLabel: {
    width: "100%",
    fontSize: tokens.font.xs,
    color: tokens.color.subtle,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
    textAlign: "center",
  },
  scoreValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    width: "100%",
  },
  scoreValue: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
  },
  scoreSuffix: {
    marginLeft: 3,
    fontSize: tokens.font.xs,
    color: tokens.color.subtle,
  },

  /** Filled panel for flow content — no border props (react-pdf layout bugs with paginated Views). */
  cardWrap: {
    padding: tokens.space.s12,
    marginBottom: tokens.space.s12,
    backgroundColor: tokens.color.surface,
  },
  cardTitle: {
    fontSize: tokens.font.md,
    fontFamily: "Helvetica-Bold",
    color: tokens.color.ink,
  },
  cardDescription: {
    marginTop: 2,
    fontSize: tokens.font.sm,
    color: tokens.color.muted,
  },

  // Executive summary tiles.
  statRow: {
    flexDirection: "row",
    marginTop: tokens.space.s8,
  },
  statTile: {
    flex: 1,
    padding: tokens.space.s8,
    backgroundColor: tokens.color.surfaceAlt,
    alignItems: "center",
  },
  statTileSpaced: {
    flex: 1,
    marginLeft: tokens.space.s8,
    padding: tokens.space.s8,
    backgroundColor: tokens.color.surfaceAlt,
    alignItems: "center",
  },
  statValue: {
    fontSize: tokens.font.xl,
    fontFamily: "Helvetica-Bold",
    color: tokens.color.ink,
    width: "100%",
    textAlign: "center",
  },
  statLabel: {
    fontSize: tokens.font.xs,
    color: tokens.color.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 2,
    width: "100%",
    textAlign: "center",
  },

  // Bullet list (Exec summary "What we checked").
  bulletList: {
    marginTop: tokens.space.s8,
  },
  bulletItem: {
    flexDirection: "row",
    marginBottom: 3,
  },
  bulletGlyph: {
    width: 8,
    fontSize: tokens.font.sm,
    color: tokens.color.muted,
  },
  bulletBody: {
    flex: 1,
    marginLeft: 6,
    fontSize: tokens.font.sm,
    color: tokens.color.inkSoft,
  },

  /** Status glyph box (! / X / OK) — View centers text better than background on Text alone. */
  statusPillBox: {
    width: 24,
    height: 20,
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  statusPillGlyph: {
    fontFamily: "Helvetica-Bold",
    fontSize: tokens.font.sm,
    lineHeight: 1,
  },
  /** Priority badge (HIGH / MED / LOW) — outer View for vertical centering. */
  priorityPillBox: {
    minWidth: 44,
    minHeight: 16,
    paddingHorizontal: 6,
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  priorityPillLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: tokens.font.xs,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    lineHeight: 1,
  },

  // Checks rendering.
  checkGroup: {
    marginTop: tokens.space.s8,
  },
  checkGroupLabel: {
    fontSize: tokens.font.sm,
    fontFamily: "Helvetica-Bold",
    color: tokens.color.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  checkRow: {
    marginBottom: tokens.space.s8,
  },
  checkHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkStatusCell: {
    width: 24,
    alignItems: "center",
  },
  checkLabel: {
    flex: 1,
    marginLeft: 6,
    fontSize: tokens.font.sm,
    fontFamily: "Helvetica-Bold",
    color: tokens.color.ink,
  },
  checkExplanation: {
    marginTop: 2,
    marginLeft: 30,
    fontSize: tokens.font.sm,
    color: tokens.color.muted,
  },
  checkScoringNote: {
    marginTop: 2,
    marginLeft: 30,
    fontSize: tokens.font.xs,
    color: tokens.color.muted,
    lineHeight: 1.35,
  },
  checkEvidence: {
    marginTop: 2,
    marginLeft: 30,
    fontSize: tokens.font.xs,
    color: tokens.color.subtle,
    fontFamily: "Helvetica-Oblique",
  },
  checkPassSummary: {
    marginTop: 6,
    paddingTop: 6,
    fontSize: tokens.font.sm,
    color: tokens.color.inkSoft,
    fontFamily: "Helvetica-Bold",
  },

  // Per-page block (wraps across pages — no borders on this node).
  pageBlock: {
    marginBottom: tokens.space.s16,
    paddingBottom: tokens.space.s12,
  },
  pageBlockLast: {
    paddingBottom: 0,
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: tokens.space.s8,
  },
  pageHeaderLeft: {
    flex: 1,
  },
  pageCategoryTag: {
    fontSize: tokens.font.xs,
    color: tokens.color.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  pageUrl: {
    fontSize: tokens.font.md,
    fontFamily: "Helvetica-Bold",
    color: tokens.color.ink,
  },
  pageScoreChip: {
    minWidth: 56,
    marginLeft: tokens.space.s12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignItems: "center",
    backgroundColor: tokens.color.surfaceAlt,
  },
  pageScoreValue: {
    fontSize: tokens.font.xl,
    fontFamily: "Helvetica-Bold",
  },
  pageScoreSuffix: {
    fontSize: tokens.font.xs,
    color: tokens.color.subtle,
    marginTop: 0,
  },

  // Pillar header inside a per-page block.
  pillarHeader: {
    marginTop: tokens.space.s8,
  },
  pillarTitle: {
    fontSize: tokens.font.md,
    fontFamily: "Helvetica-Bold",
    color: tokens.color.ink,
  },
  pillarDescription: {
    marginTop: 1,
    fontSize: tokens.font.xs,
    color: tokens.color.muted,
  },

  // Action plan (fixes) rows.
  actionRow: {
    flexDirection: "row",
    paddingVertical: tokens.space.s6,
    marginBottom: 2,
  },
  actionPriorityCell: {
    width: 50,
    alignItems: "center",
  },
  actionBody: {
    flex: 1,
    marginLeft: tokens.space.s8,
  },
  actionTitle: {
    fontSize: tokens.font.sm,
    fontFamily: "Helvetica-Bold",
    color: tokens.color.ink,
  },
  actionDetail: {
    marginTop: 2,
    fontSize: tokens.font.sm,
    color: tokens.color.muted,
  },
  actionAffected: {
    marginTop: 4,
    fontSize: tokens.font.xs,
    color: tokens.color.subtle,
  },

  // Category banner inside per-page detail.
  categoryBanner: {
    marginTop: tokens.space.s12,
    marginBottom: tokens.space.s8,
    paddingVertical: 6,
    paddingHorizontal: tokens.space.s8,
    backgroundColor: tokens.color.surfaceAlt,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  categoryBannerTitle: {
    fontSize: tokens.font.md,
    fontFamily: "Helvetica-Bold",
    color: tokens.color.ink,
  },
  categoryBannerCount: {
    fontSize: tokens.font.xs,
    color: tokens.color.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  // Appendix glossary.
  glossaryItem: {
    marginBottom: tokens.space.s6,
  },
  glossaryTerm: {
    fontSize: tokens.font.sm,
    fontFamily: "Helvetica-Bold",
    color: tokens.color.ink,
  },
  glossaryDefinition: {
    marginTop: 1,
    fontSize: tokens.font.sm,
    color: tokens.color.muted,
  },
});

// --- Helpers ----------------------------------------------------------------

function safeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function statusGlyph(result: CheckResult): string {
  if (result === "pass") return "OK";
  if (result === "warn") return "!";
  return "X";
}

function statusColors(result: CheckResult): { bg: string; fg: string } {
  if (result === "pass")
    return { bg: tokens.color.passBg, fg: tokens.color.pass };
  if (result === "warn")
    return { bg: tokens.color.warnBg, fg: tokens.color.warn };
  return { bg: tokens.color.failBg, fg: tokens.color.fail };
}

function scoreTint(score: number | null | undefined): {
  bg: string;
  fg: string;
} {
  if (score == null) return { bg: tokens.color.surfaceAlt, fg: tokens.color.subtle };
  if (score >= 80) return { bg: tokens.color.passBg, fg: tokens.color.pass };
  if (score >= 60) return { bg: tokens.color.warnBg, fg: tokens.color.warn };
  return { bg: tokens.color.failBg, fg: tokens.color.fail };
}

function priorityWeight(p: FixPriority | string | undefined): number {
  if (p === "high") return 0;
  if (p === "medium") return 1;
  if (p === "low") return 2;
  return 3;
}

function priorityLabel(p: FixPriority | string | undefined): string {
  if (p === "high") return "HIGH";
  if (p === "medium") return "MED";
  if (p === "low") return "LOW";
  return safeText(p).toUpperCase() || "—";
}

function priorityColors(p: FixPriority | string | undefined): {
  bg: string;
  fg: string;
} {
  if (p === "high") return { bg: tokens.color.failBg, fg: tokens.color.fail };
  if (p === "medium") return { bg: tokens.color.warnBg, fg: tokens.color.warn };
  if (p === "low") return { bg: tokens.color.passBg, fg: tokens.color.pass };
  return { bg: tokens.color.surfaceAlt, fg: tokens.color.muted };
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

function evidenceSummary(evidence: AuditCheckEvidence | undefined): string {
  if (!evidence || !evidence.items?.length) return "";
  const total = evidence.totalCount ?? evidence.items.length;
  const first = evidence.items.slice(0, 2).map(describeEvidenceItem).filter(Boolean);
  if (first.length === 0) return "";
  const moreCount = Math.max(0, total - first.length);
  const moreSuffix = moreCount > 0 ? ` +${moreCount} more` : "";
  const inspectorSuffix = evidence.inspector
    ? ` (see ${evidence.inspector} inspector)`
    : "";
  return `Examples: ${first.join(", ")}${moreSuffix}${inspectorSuffix}`;
}

function guidanceSummary(evidence: AuditCheckEvidence | undefined): string {
  const lines = evidence?.guidanceLines?.filter((l) => l.trim());
  if (!lines?.length) return "";
  return `Suggested next steps:\n${lines.map((l) => `• ${safeText(l)}`).join("\n")}`;
}

/** Short PDF rubric: how each AI subscore is read from the excerpt; complements model guidanceLines when present. */
const AI_CHECK_SCORING_CONTEXT: Record<string, string> = {
  ai_eeat:
    "Score reflects trust and credibility cues visible in the excerpt—authorship, topical depth, citations, policies, and contact paths—not legal or clinical verification. Improve with clear bylines, dates, credentials, and concrete proof points editors can verify on-page.",
  ai_content_depth:
    "Score reflects how substantive the excerpt reads for the topic versus thin boilerplate. Improve with specific answers, examples, FAQs, and sections that match searcher intent.",
  ai_scannability:
    "Score reflects headings, lists, emphasis, and layout implied from the excerpt’s structure. Improve with logical H2/H3 hierarchy, bullets for steps, and short paragraphs so humans and models can skim.",
  ai_entity_clarity:
    "Score reflects whether title, headings, and body copy consistently name the primary organization/service/location the page is about. Improve by aligning H1 with the main offer, repeating the brand/geo plainly, and matching visible entities to JSON-LD where present.",
};

function describeEvidenceItem(item: AuditCheckEvidenceItem): string {
  if (item.type === "link") return safeText(item.anchor) || safeText(item.url);
  if (item.type === "image") return safeText(item.alt) || safeText(item.src);
  if (item.type === "heading") return `H${item.level} ${safeText(item.text)}`;
  if (item.type === "schema") return safeText(item.schemaType);
  if (item.type === "psi_audit") return safeText(item.title);
  if (item.type === "kv") return `${safeText(item.label)}: ${safeText(item.value)}`;
  return "";
}

// --- Reusable components ----------------------------------------------------

function StatusPill({ result }: { result: CheckResult }) {
  const c = statusColors(result);
  return (
    <View style={[styles.statusPillBox, { backgroundColor: c.bg }]}>
      <Text
        style={[
          styles.statusPillGlyph,
          { color: c.fg, ...(result === "pass" ? { fontSize: tokens.font.xs } : {}) },
        ]}
      >
        {statusGlyph(result)}
      </Text>
    </View>
  );
}

function PriorityPill({ priority }: { priority: FixPriority | string }) {
  const c = priorityColors(priority);
  return (
    <View style={[styles.priorityPillBox, { backgroundColor: c.bg }]}>
      <Text style={[styles.priorityPillLabel, { color: c.fg }]}>{priorityLabel(priority)}</Text>
    </View>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  first = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  first?: boolean;
}) {
  return (
    <View
      style={
        first
          ? [styles.sectionHeading, styles.sectionHeadingFirst]
          : styles.sectionHeading
      }
      wrap={false}
    >
      {eyebrow ? <Text style={styles.sectionEyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.sectionTitle}>{title}</Text>
      {description ? (
        <Text style={styles.sectionDescription}>{description}</Text>
      ) : null}
      <View style={styles.divider} />
    </View>
  );
}

function RunningHeader({
  leftTitle,
  auditDate,
}: {
  leftTitle: string;
  auditDate: string;
}) {
  return (
    <View style={styles.runningHeader}>
      <View style={styles.runningHeaderRow}>
        <Text style={styles.runningHeaderLeft}>{leftTitle}</Text>
        <Text>{auditDate}</Text>
      </View>
      <View style={styles.runningHeaderHairline} />
    </View>
  );
}

function PdfFooter({
  brandName,
  generated,
}: {
  brandName: string;
  generated: string;
}) {
  return (
    <View style={styles.footer}>
      <View style={styles.footerHairline} />
      <View style={styles.footerRow}>
        <Text>
          {brandName} — generated {generated}
        </Text>
        <Text
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} / ${totalPages}`
          }
        />
      </View>
    </View>
  );
}

interface ChecksTableProps {
  checks: AuditCheck[];
  hidePass?: boolean;
  showEvidence?: boolean;
  /** When true, group rows by `check.category`; otherwise render flat. */
  grouped?: boolean;
}

function ChecksTable({
  checks,
  hidePass = false,
  showEvidence = true,
  grouped = true,
}: ChecksTableProps) {
  if (checks.length === 0) {
    return (
      <Text style={styles.cardDescription}>No checks recorded.</Text>
    );
  }

  const visible = hidePass ? checks.filter((c) => c.result !== "pass") : checks;
  const passCount = checks.length - visible.length;

  if (visible.length === 0) {
    return (
      <Text style={styles.checkPassSummary}>
        All {checks.length} checks passing.
      </Text>
    );
  }

  const renderRow = (c: AuditCheck) => {
    const ev = showEvidence ? evidenceSummary(c.evidence) : "";
    const guide = showEvidence ? guidanceSummary(c.evidence) : "";
    const aiContext = AI_CHECK_SCORING_CONTEXT[c.key] ?? "";
    return (
      <View key={c.key} style={styles.checkRow} wrap={false}>
        <View style={styles.checkHeader}>
          <View style={styles.checkStatusCell}>
            <StatusPill result={c.result} />
          </View>
          <Text style={styles.checkLabel}>{safeText(c.label)}</Text>
        </View>
        {c.explanation ? (
          <Text style={styles.checkExplanation}>{safeText(c.explanation)}</Text>
        ) : null}
        {aiContext ? (
          <Text style={styles.checkScoringNote}>{safeText(aiContext)}</Text>
        ) : null}
        {guide ? (
          <Text style={styles.checkEvidence}>{guide}</Text>
        ) : null}
        {ev ? <Text style={styles.checkEvidence}>{ev}</Text> : null}
      </View>
    );
  };

  if (!grouped) {
    return (
      <View>
        {visible.map(renderRow)}
        {hidePass && passCount > 0 ? (
          <Text style={styles.checkPassSummary}>
            +{passCount} additional check{passCount === 1 ? "" : "s"} passing.
          </Text>
        ) : null}
      </View>
    );
  }

  const groups = checksByCategory(visible);
  const multi = groups.length > 1 || (groups[0]?.category ?? "") !== "General";
  return (
    <View>
      {groups.map(({ category, items }) => (
        <View key={category} style={styles.checkGroup} wrap>
          {multi ? (
            <Text style={styles.checkGroupLabel}>{category}</Text>
          ) : null}
          {items.map(renderRow)}
        </View>
      ))}
      {hidePass && passCount > 0 ? (
        <Text style={styles.checkPassSummary}>
          +{passCount} additional check{passCount === 1 ? "" : "s"} passing.
        </Text>
      ) : null}
    </View>
  );
}

// --- Action plan aggregation ------------------------------------------------

interface AggregatedAction {
  key: string;
  priority: FixPriority | string;
  title: string;
  detail: string;
  affectedUrls: string[];
}

function aggregateActionItems(pages: AuditPage[]): AggregatedAction[] {
  const map = new Map<string, AggregatedAction>();
  for (const p of pages) {
    const fixes = (p.fixes ?? []) as FixItem[];
    for (const fix of fixes) {
      const title = safeText(fix.title).trim();
      if (!title) continue;
      const priority = (fix.priority ?? "low") as FixPriority;
      const detail = safeText(fix.detail).trim();
      const key = `${priority}|${title.toLowerCase()}`;
      const existing = map.get(key);
      if (existing) {
        if (!existing.affectedUrls.includes(p.url)) {
          existing.affectedUrls.push(p.url);
        }
        // Prefer the longest non-empty detail so we don't lose specificity.
        if (detail.length > existing.detail.length) existing.detail = detail;
      } else {
        map.set(key, {
          key,
          priority,
          title,
          detail,
          affectedUrls: [p.url],
        });
      }
    }
  }

  return [...map.values()].sort((a, b) => {
    const pa = priorityWeight(a.priority);
    const pb = priorityWeight(b.priority);
    if (pa !== pb) return pa - pb;
    if (b.affectedUrls.length !== a.affectedUrls.length) {
      return b.affectedUrls.length - a.affectedUrls.length;
    }
    return a.title.localeCompare(b.title);
  });
}

function ActionPlanRow({ item }: { item: AggregatedAction }) {
  const count = item.affectedUrls.length;
  const affectedLine =
    count <= 3
      ? `Affects: ${item.affectedUrls.join(", ")}`
      : `Affects ${count} URLs (see per-page detail)`;
  return (
    <View style={styles.actionRow} wrap={false}>
      <View style={styles.actionPriorityCell}>
        <PriorityPill priority={item.priority} />
      </View>
      <View style={styles.actionBody}>
        <Text style={styles.actionTitle}>{item.title}</Text>
        {item.detail ? (
          <Text style={styles.actionDetail}>{item.detail}</Text>
        ) : null}
        <Text style={styles.actionAffected}>{affectedLine}</Text>
      </View>
    </View>
  );
}

// --- Per-page detail --------------------------------------------------------

function PillarSection({
  title,
  description,
  checks,
}: {
  title: string;
  description: string;
  checks: AuditCheck[];
}) {
  return (
    <View style={styles.pillarHeader}>
      <Text style={styles.pillarTitle}>{title}</Text>
      <Text style={styles.pillarDescription}>{description}</Text>
      <ChecksTable checks={checks} hidePass />
    </View>
  );
}

function PageBlock({
  page,
  isLast,
}: {
  page: AuditPage;
  isLast: boolean;
}) {
  const seo = (page.seo_results ?? []) as AuditCheck[];
  const geo = (page.geo_results ?? []) as AuditCheck[];
  const url = safeText(page.url);
  const category =
    page.sitemap_category_label?.trim() || "Uncategorized";
  const tint = scoreTint(page.score);

  return (
    <View
      style={isLast ? [styles.pageBlock, styles.pageBlockLast] : styles.pageBlock}
      wrap
    >
      <View style={styles.pageHeader} wrap={false}>
        <View style={styles.pageHeaderLeft}>
          <Text style={styles.pageCategoryTag}>{category}</Text>
          <Text style={styles.pageUrl}>{url}</Text>
        </View>
        <View style={[styles.pageScoreChip, { backgroundColor: tint.bg }]}>
          <Text style={[styles.pageScoreValue, { color: tint.fg }]}>
            {page.score != null ? page.score : "—"}
          </Text>
          <Text style={styles.pageScoreSuffix}>of 100</Text>
        </View>
      </View>

      <PillarSection
        title={SEO_SECTION_TITLE}
        description={SEO_SECTION_DESCRIPTION}
        checks={seo}
      />
      <PillarSection
        title={GEO_SECTION_TITLE}
        description={GEO_SECTION_DESCRIPTION}
        checks={geo}
      />
    </View>
  );
}

// --- Page grouping by sitemap category --------------------------------------

interface PageGroup {
  label: string;
  items: AuditPage[];
}

function groupPagesByCategory(pages: AuditPage[]): PageGroup[] {
  const map = new Map<string, AuditPage[]>();
  for (const p of pages) {
    const label = p.sitemap_category_label?.trim() || "Uncategorized";
    const arr = map.get(label) ?? [];
    arr.push(p);
    map.set(label, arr);
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      const ka = categoryLabelSortKey(a);
      const kb = categoryLabelSortKey(b);
      if (ka !== kb) return ka - kb;
      return a.localeCompare(b);
    })
    .map(([label, items]) => ({
      label,
      items: [...items].sort((x, y) => (y.score ?? -1) - (x.score ?? -1)),
    }));
}

// --- Headline aggregates ----------------------------------------------------

interface HeadlineCounts {
  fails: number;
  warns: number;
  passes: number;
  fixes: number;
  fixesByPriority: Record<FixPriority, number>;
}

function computeHeadlineCounts(
  pages: AuditPage[],
  siteWide: AuditCheck[],
  cruxField: AuditCheck[],
): HeadlineCounts {
  const counts: HeadlineCounts = {
    fails: 0,
    warns: 0,
    passes: 0,
    fixes: 0,
    fixesByPriority: { high: 0, medium: 0, low: 0 },
  };

  const tally = (list: AuditCheck[]) => {
    for (const c of list) {
      if (c.result === "fail") counts.fails += 1;
      else if (c.result === "warn") counts.warns += 1;
      else if (c.result === "pass") counts.passes += 1;
    }
  };

  tally(siteWide);
  tally(cruxField);

  for (const p of pages) {
    tally((p.seo_results ?? []) as AuditCheck[]);
    tally((p.geo_results ?? []) as AuditCheck[]);
    const fixes = (p.fixes ?? []) as FixItem[];
    counts.fixes += fixes.length;
    for (const fx of fixes) {
      const prio = (fx.priority ?? "low") as FixPriority;
      if (counts.fixesByPriority[prio] != null) {
        counts.fixesByPriority[prio] += 1;
      }
    }
  }
  return counts;
}

// --- Document ---------------------------------------------------------------

export interface AuditReportPdfProps {
  audit: Audit;
  community: Community | null;
  company: Company | null;
  pages: AuditPage[];
  siteWideChecks: AuditCheck[];
  cruxFieldChecks: AuditCheck[];
}

export function AuditReportPdfDocument({
  audit,
  community,
  company,
  pages,
  siteWideChecks,
  cruxFieldChecks,
}: AuditReportPdfProps) {
  const generated = new Date().toLocaleString();
  const auditDate = new Date(audit.created_at).toLocaleDateString();

  const companyName = safeText(company?.name);
  const communityName = safeText(community?.name || "Community");
  const websiteUrl = safeText(community?.website_url);
  /** Organization shown in running header / footer (company when linked). */
  const pdfBrandName = companyName || communityName;

  const actionItems = aggregateActionItems(pages);
  const headlineCounts = computeHeadlineCounts(
    pages,
    siteWideChecks,
    cruxFieldChecks,
  );
  const pageGroups = groupPagesByCategory(pages);
  const distinctCategories = pageGroups.length;
  const topActions = actionItems
    .filter((a) => a.priority === "high")
    .slice(0, 3);

  const overallTint = scoreTint(audit.score);
  const seoTint = scoreTint(audit.seo_score);
  const geoTint = scoreTint(audit.geo_score);

  return (
    <Document
      title={`${pdfBrandName} — SEO & GEO checks — ${communityName}`}
      author={pdfBrandName}
      subject="SEO and GEO checks report"
    >
      {/* Cover + executive summary + site-wide findings */}
      <Page
        size="A4"
        style={styles.page}
        wrap
        bookmark={{ title: "Cover & executive summary", fit: true, expanded: true }}
      >
        <PdfFooter brandName={pdfBrandName} generated={generated} />

        {/* Cover hero (no running header on cover for cleaner look). */}
        <View style={styles.hero} wrap={false}>
          <Text style={styles.heroEyebrow}>SEO &amp; GEO Checks</Text>
          <Text style={styles.heroTitle}>{communityName}</Text>
          {company?.name ? (
            <Text style={styles.heroSubtitle}>{companyName}</Text>
          ) : null}

          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{auditDate}</Text>
            </View>
            <View style={styles.metaItemSpaced}>
              <Text style={styles.metaLabel}>Status</Text>
              <Text style={styles.metaValue}>{safeText(audit.status)}</Text>
            </View>
            {typeof audit.engine_version === "number" ? (
              <View style={styles.metaItemSpaced}>
                <Text style={styles.metaLabel}>Engine</Text>
                <Text style={styles.metaValue}>v{audit.engine_version}</Text>
              </View>
            ) : null}
          </View>

          {websiteUrl ? (
            <Text style={styles.heroWebsite}>{websiteUrl}</Text>
          ) : null}

          <View style={styles.scoreRow} wrap={false}>
            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Overall</Text>
              <View style={styles.scoreValueRow}>
                <Text style={[styles.scoreValue, { color: overallTint.fg }]}>
                  {audit.score ?? "—"}
                </Text>
                <Text style={styles.scoreSuffix}>/ 100</Text>
              </View>
            </View>
            <View style={styles.scoreCardSpaced}>
              <Text style={styles.scoreLabel}>SEO</Text>
              <View style={styles.scoreValueRow}>
                <Text style={[styles.scoreValue, { color: seoTint.fg }]}>
                  {audit.seo_score ?? "—"}
                </Text>
                <Text style={styles.scoreSuffix}>/ 100</Text>
              </View>
            </View>
            <View style={styles.scoreCardSpaced}>
              <Text style={styles.scoreLabel}>GEO</Text>
              <View style={styles.scoreValueRow}>
                <Text style={[styles.scoreValue, { color: geoTint.fg }]}>
                  {audit.geo_score ?? "—"}
                </Text>
                <Text style={styles.scoreSuffix}>/ 100</Text>
              </View>
            </View>
            <View style={styles.scoreCardSpaced}>
              <Text style={styles.scoreLabel}>Pages crawled</Text>
              <View style={styles.scoreValueRow}>
                <Text style={styles.scoreValue}>{audit.pages_crawled}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Executive summary */}
        <SectionHeading
          eyebrow="Section 1"
          title="Executive summary"
          description="What this visibility scan covered and where to focus first."
        />

        <View style={styles.cardWrap} wrap>
          <Text style={styles.cardTitle}>What we checked</Text>
          <View style={styles.bulletList}>
            <BulletLine>
              {pages.length} URL{pages.length === 1 ? "" : "s"} across{" "}
              {distinctCategories} sitemap categor
              {distinctCategories === 1 ? "y" : "ies"}.
            </BulletLine>
            <BulletLine>
              {siteWideChecks.length} site-wide prob
              {siteWideChecks.length === 1 ? "e" : "es"} (robots.txt, sitemap,
              AI bot rules).
            </BulletLine>
            {cruxFieldChecks.length > 0 ? (
              <BulletLine>
                {cruxFieldChecks.length} CrUX field metric
                {cruxFieldChecks.length === 1 ? "" : "s"} (Chrome UX Report
                p75).
              </BulletLine>
            ) : null}
          </View>
        </View>

        <View style={styles.statRow} wrap={false}>
          <View style={styles.statTile}>
            <Text style={[styles.statValue, { color: tokens.color.fail }]}>
              {headlineCounts.fails}
            </Text>
            <Text style={styles.statLabel}>Fails</Text>
          </View>
          <View style={styles.statTileSpaced}>
            <Text style={[styles.statValue, { color: tokens.color.warn }]}>
              {headlineCounts.warns}
            </Text>
            <Text style={styles.statLabel}>Warnings</Text>
          </View>
          <View style={styles.statTileSpaced}>
            <Text style={styles.statValue}>{headlineCounts.fixes}</Text>
            <Text style={styles.statLabel}>Suggested fixes</Text>
          </View>
          <View style={styles.statTileSpaced}>
            <Text style={[styles.statValue, { color: tokens.color.fail }]}>
              {headlineCounts.fixesByPriority.high}
            </Text>
            <Text style={styles.statLabel}>High priority</Text>
          </View>
        </View>

        {topActions.length > 0 ? (
          <View style={[styles.cardWrap, { marginTop: tokens.space.s12 }]} wrap>
            <Text style={styles.cardTitle}>Top issues to address first</Text>
            <Text style={styles.cardDescription}>
              The highest-priority items from the consolidated action plan.
            </Text>
            <View style={{ marginTop: tokens.space.s8 }}>
              {topActions.map((item) => (
                <ActionPlanRow key={item.key} item={item} />
              ))}
            </View>
          </View>
        ) : null}

        {/* Site-wide findings */}
        <SectionHeading
          eyebrow="Section 2"
          title="Site-wide findings"
          description="Origin-level signals shared by every URL on this site."
        />

        <View style={styles.cardWrap} wrap>
          <Text style={styles.cardTitle}>Crawl signals</Text>
          <Text style={styles.cardDescription}>
            robots.txt, AI bot directives, and sitemap discovery. Failures here
            usually affect the entire site.
          </Text>
          <ChecksTable checks={siteWideChecks} hidePass={false} />
        </View>

        <View style={styles.cardWrap} wrap>
          <Text style={styles.cardTitle}>Field metrics — Chrome UX Report</Text>
          <Text style={styles.cardDescription}>
            Origin-level p75 metrics from real Chrome users when available.
          </Text>
          <ChecksTable checks={cruxFieldChecks} hidePass={false} />
        </View>

        <RunningHeader leftTitle={pdfBrandName} auditDate={auditDate} />
      </Page>

      {/* Prioritized action plan */}
      <Page
        size="A4"
        style={styles.page}
        wrap
        bookmark={{ title: "Prioritized action plan", fit: true }}
      >
        <RunningHeader leftTitle={pdfBrandName} auditDate={auditDate} />
        <PdfFooter brandName={pdfBrandName} generated={generated} />

        <SectionHeading
          eyebrow="Section 3"
          title="Prioritized action plan"
          description="All suggested fixes across scanned pages, deduplicated and ordered by priority then breadth of impact."
          first
        />

        {actionItems.length === 0 ? (
          <Text style={styles.cardDescription}>
            No actionable fixes were generated for this scan. See the per-page
            detail for individual check results.
          </Text>
        ) : (
          <View>
            {actionItems.map((item) => (
              <ActionPlanRow key={item.key} item={item} />
            ))}
          </View>
        )}
      </Page>

      {/* Per-page detail, grouped by sitemap category */}
      <Page
        size="A4"
        style={styles.page}
        wrap
        bookmark={{ title: "Per-page detail", fit: true }}
      >
        <RunningHeader leftTitle={pdfBrandName} auditDate={auditDate} />
        <PdfFooter brandName={pdfBrandName} generated={generated} />

        <SectionHeading
          eyebrow="Section 4"
          title="Per-page detail"
          description="Each URL scanned, grouped by the sitemap category it belongs to. Passing checks are summarized; failures and warnings are listed in full."
          first
        />

        {pageGroups.length === 0 ? (
          <Text style={styles.cardDescription}>
            No page results were recorded for this scan.
          </Text>
        ) : (
          pageGroups.map((group) => (
            <View key={group.label} wrap>
              <View style={styles.categoryBanner} wrap={false}>
                <Text style={styles.categoryBannerTitle}>{group.label}</Text>
                <Text style={styles.categoryBannerCount}>
                  {group.items.length} URL
                  {group.items.length === 1 ? "" : "s"}
                </Text>
              </View>
              {group.items.map((p, idx) => (
                <PageBlock
                  key={p.id}
                  page={p}
                  isLast={idx === group.items.length - 1}
                />
              ))}
            </View>
          ))
        )}
      </Page>

      {/* Appendix */}
      <Page
        size="A4"
        style={styles.page}
        wrap
        bookmark={{ title: "Appendix", fit: true }}
      >
        <RunningHeader leftTitle={pdfBrandName} auditDate={auditDate} />
        <PdfFooter brandName={pdfBrandName} generated={generated} />

        <SectionHeading
          eyebrow="Appendix A"
          title="Glossary"
          description="Recurring terms used in this report."
          first
        />
        <View style={styles.cardWrap} wrap>
          <GlossaryItem
            term="SEO (search visibility)"
            definition="How findable you are in classic search — titles, metadata, links, and technical basics."
          />
          <GlossaryItem
            term="GEO (AI-ready content)"
            definition="How well AI systems can understand, quote, and reuse your content — structure, depth, and clarity."
          />
          <GlossaryItem
            term="Site-wide probe"
            definition="An origin-level signal (robots.txt, sitemap discovery, AI bot rules) that applies to every URL on the site rather than a single page."
          />
          <GlossaryItem
            term="CrUX field metrics"
            definition="Chrome UX Report 28-day origin-level p75 metrics (LCP, INP, CLS) gathered from real Chrome users — only available when traffic meets Google's threshold."
          />
          <GlossaryItem
            term="Pass / Warn / Fail"
            definition="Each check returns one verdict per URL. Pass: no issue flagged. Warn: review recommended. Fail: fix recommended when you can."
          />
        </View>
      </Page>
    </Document>
  );
}

function BulletLine({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletItem}>
      <Text style={styles.bulletGlyph}>•</Text>
      <Text style={styles.bulletBody}>{children}</Text>
    </View>
  );
}

function GlossaryItem({
  term,
  definition,
}: {
  term: string;
  definition: string;
}) {
  return (
    <View style={styles.glossaryItem}>
      <Text style={styles.glossaryTerm}>{term}</Text>
      <Text style={styles.glossaryDefinition}>{definition}</Text>
    </View>
  );
}
