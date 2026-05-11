/**
 * Expert human checklist rows (stored per community in `manual_check_results`).
 * Automated crawl/score output lives in deterministic / PSI / CrUX layers.
 * Rows here are intentionally coarse: one pass/fail bucket per real review session, not duplicates of HTML heuristics or AI GEO subscores.
 */

export interface ManualTemplateItem {
  /** Stable storage key */
  key: string;
  /** UI section heading */
  category: string;
  label: string;
  /** Extra context for auditors */
  helper?: string;
}

export const COMMUNITY_MANUAL_ITEMS: ManualTemplateItem[] = [
  // Crawlability / console (still requires GSC / operational access)
  {
    key: "gsc_sitemap_submitted",
    category: "Crawlability",
    label: "XML sitemap submitted in Google Search Console",
    helper: "Confirm Coverage / Sitemaps shows the URL as Successful.",
  },
  {
    key: "gsc_monitoring",
    category: "Crawlability",
    label: "Google Search Console property verified and monitored",
  },
  {
    key: "crawl_budget_reviewed",
    category: "Crawlability",
    label: "Crawl budget not wasted on low-value paths (manual review)",
  },

  // Site performance — beyond lab/field APIs
  {
    key: "real_device_spot_check",
    category: "Site performance",
    label: "Real-device spot check on priority pages (slow 3G / mid-tier phone)",
    helper:
      "Automated runs include PSI (lab, when keyed) and CrUX aggregates (real users, when coverage exists). Use this sign-off for layout/UX regressions aggregate metrics hide.",
  },
  {
    key: "mixed_content_removed",
    category: "Site performance",
    label: "No mixed-content or SSL certificate issues in browser + GSC",
    helper:
      "Per-page HTTPS is checked automatically; still validate cert chain, passive mixed content, browser warnings, and GSC Coverage / Security issues.",
  },
  {
    key: "broken_links_reviewed",
    category: "Site performance",
    label: "Broken links and redirect chains reviewed (crawler or Screaming Frog)",
  },

  // On-page — editorial / strategy (automation covers outlines, H1 count, internal link counts, near-dup, FAQ/schema heuristics)
  {
    key: "seo_topics_editorial",
    category: "SEO — on-page",
    label: "Editorial fit: page topics, heading intent, keyword focus, and hub-to-spoke internal journeys",
    helper:
      "Assign when you have validated strategy beyond automated structure checks (single H1, outline, link counts) and GEO/AI subscores on each run.",
  },

  // Off-page (third-party / GBP — no in-app automation yet)
  {
    key: "backlink_toxic_review",
    category: "SEO — off-page and authority",
    label: "Backlink profile reviewed — no toxic patterns (Disavow if needed)",
  },
  {
    key: "care_industry_links",
    category: "SEO — off-page and authority",
    label: "At least 3 authoritative inbound links from care / health industry sources",
  },
  {
    key: "outbound_authority_links",
    category: "SEO — off-page and authority",
    label: "Outbound authority references on key pages (gov, associations, research)",
  },
  {
    key: "gbp_optimized",
    category: "SEO — off-page and authority",
    label: "Google Business Profile active and fully optimized",
  },

  // Local / NAP (directories and operations)
  {
    key: "nap_directories",
    category: "Local SEO and NAP",
    label: "NAP consistent across major directories (manual audit)",
  },
  {
    key: "eldercare_directories",
    category: "Local SEO and NAP",
    label: "Listed on relevant elder-care directories where applicable",
  },
  {
    key: "reviews_program",
    category: "Local SEO and NAP",
    label: "Reviews actively collected on Google, Yelp, and niche directories",
  },

  // Content / GEO — three buckets replace many overlapping micro-rows
  {
    key: "geo_content_structure",
    category: "Content and GEO readiness",
    label: "Skimmable answer structure: summaries, lists, modular sections, visuals/tables where they help",
    helper:
      "Use for qualitative pass on layouts that help humans and citations in AI—not only automated FAQ heading / list / schema signals.",
  },
  {
    key: "geo_content_voice",
    category: "Content and GEO readiness",
    label: "Voice and readability for seniors/families (tone, jargon, hedging, paragraph flow, topical variety)",
    helper:
      "One human sign-off for what used to be separate tone/jargon/GEO-language rows.",
  },
  {
    key: "geo_content_proof",
    category: "Content and GEO readiness",
    label: "Proof and specificity: metrics/timelines for claims + acronyms defined on first use",
  },

  // Elder-care niche — two buckets replace eight granular rows
  {
    key: "geo_niche_offerings",
    category: "Niche — elderly care GEO",
    label:
      "Care offerings storytelling: priority facility lines, comparisons (e.g. SNF vs ALF), pain-point coverage, conversational/voice intent where relevant",
  },
  {
    key: "geo_niche_trust",
    category: "Niche — elderly care GEO",
    label:
      "Trust signals: regulator/agency wording, associations/research cites, authoritative statistics, testimonials/case studies with specifics",
  },
];
