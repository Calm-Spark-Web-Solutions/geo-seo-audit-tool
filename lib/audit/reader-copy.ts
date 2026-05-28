/** Shared plain-language labels for SEO vs GEO in web UI and PDF. */

export const SEO_SECTION_TITLE = "SEO (search visibility)";
export const SEO_SECTION_DESCRIPTION =
  "How findable you are in classic search — titles, metadata, links, and technical basics.";

export const GEO_SECTION_TITLE = "GEO (AI-ready content)";
export const GEO_SECTION_DESCRIPTION =
  "How well AI systems can understand, quote, and reuse your content — structure, depth, and clarity. AI subscores (0–100) are model judgments on the visible text excerpt for each URL; when captured, bulleted “Suggested next steps” appear under each AI row.";

export const HOW_TO_READ_AUDIT =
  "Each line is a single check on this page snapshot. Pass means we did not flag an issue. Warning means something to review or improve. Fail means we recommend fixing it when you can.";

/**
 * Headline + blurb for the audit-detail "Search traffic detail" expander,
 * which combines top GSC queries, top GSC landing pages, and AI assistant
 * referrer traffic from GA4 in one section.
 */
export const SEARCH_TRAFFIC_SECTION_TITLE = "Search traffic detail";
export const SEARCH_TRAFFIC_SECTION_DESCRIPTION =
  "What people searched to find this community, which pages of yours they landed on, and how many visits came from AI assistants like ChatGPT, Perplexity, Gemini, or Copilot. All numbers cover the last 28 days.";

/** Shown while a visibility scan is queued or crawling/scoring URLs. */
export const AUDIT_RUNNING_EXPECTATION =
  "Visibility scans analyze each URL with crawlers, PageSpeed, and optional AI scoring. This can take several minutes — larger page counts take longer.";

/** Compact line for list rows (dashboard, history). */
export const AUDIT_RUNNING_EXPECTATION_SHORT =
  "May take several minutes depending on page count.";

/** When pending + progress_total set but no pages scored yet (often a retry). */
export const AUDIT_RETRY_PENDING_HINT =
  "Runner failed or retrying — open the scan and use Retry runner if this stays stuck.";
