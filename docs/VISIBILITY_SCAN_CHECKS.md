# Visibility scan checks reference

This document lists checks implemented in **RankLume** as of the codebase in `lib/scoring/` and the expert checklist template in `lib/checklists/community-manual.ts`.

Results are typically **pass**, **warn**, or **fail** (some numeric layers expose 0–100 scores). Several layers run only when API keys or env flags are set — those are called out below.

---

## Automated checks

These run during a visibility scan without human sign-off in the app.

### Per-page HTML heuristics (`lib/scoring/deterministic.ts`)

Deterministic parsing of each fetched page’s HTML (no browser). Checks are split into **SEO** and **GEO** pillars in the product.

**SEO-oriented (`seo_checks` / pillar SEO)**

| Key | Label (UI) |
|-----|------------|
| `html_lang` | Document language (`<html lang>`) |
| `title_length` | Title tag length |
| `meta_description` | Meta description length |
| `h1_count` | Single H1 |
| `heading_outline` | Heading level outline |
| `subheading_depth` | H2–H4 structure |
| `breadcrumb_nav` | Breadcrumb navigation |
| `webp_surface` | WebP / responsive images |
| `clean_url_query` | URL query string complexity |
| `https` | HTTPS |
| `mixed_content_html` | Passive mixed content (HTML) |
| `canonical` | Canonical link |
| `viewport` | Mobile viewport |
| `robots_meta` | Indexability (robots + headers) |
| `redirect_chain` | Redirect chain (fetch) *(when fetch metadata is available)* |
| `fetch_final_url` | Fetched URL vs requested URL *(when fetch metadata is available)* |
| `og_tags` | Open Graph tags |
| `twitter_card` | Twitter card |
| `hreflang` | hreflang alternates |

**GEO / hybrid (`geo_checks`; includes structured data and extractability)**

| Key | Label (UI) |
|-----|------------|
| `img_alt` | Image alt text |
| `word_count` | Content depth (word count) |
| `blog_editorial_depth` | Blog / editorial depth (heuristic) |
| `semantic_landmarks` | Semantic landmarks |
| `faq_heading` | FAQ-style heading |
| `json_ld` | Structured data (JSON-LD) |
| `json_ld_syntax` | JSON-LD parses cleanly |
| `structured_data_coverage` | Structured data coverage (@types) |
| `schema_organization_family` | Schema: Organization / local entity |
| `schema_website` | Schema: WebSite |
| `schema_service_faq` | Schema: Service or FAQPage |
| `schema_article` | Schema: Article / BlogPosting |
| `schema_item_list` | Schema: ItemList |
| `schema_nap_signals` | Schema: NAP / contact hints |
| *(plus dynamic offline rows — see below)* |
| `internal_links` | Internal links |
| `entity_consistency` | Entity consistency |
| `lists_and_qa` | Lists and Q&A |
| `images_with_captions` | Images with captions |

**Offline JSON-LD heuristics** (`structuredDataOfflineHeuristics` in `lib/scoring/schema-heuristic.ts`, merged into GEO checks when JSON-LD blocks exist)

| Key | Label (UI) |
|-----|------------|
| `schema_ld_context_hint` | JSON-LD @context (offline) |
| `schema_org_name_offline` | Organization name (offline) |
| `schema_website_url_offline` | WebSite URL (offline) |
| `schema_local_address_offline` | Local entity address (offline) |
| `schema_review_shape_offline` | Review schema shape (offline) |
| `schema_aggregate_shape_offline` | AggregateRating schema shape (offline) |
| `schema_trust_reviews_hint` | Trust signals: reviews in JSON-LD |

### Internal link probes (`lib/scoring/broken-internal-links.ts`)

**Requires** the audit runner HTML fetch path (same as visibility scans). Bounded HEAD/GET sample of same-origin links from each page.

| Key | Label (UI) |
|-----|------------|
| `internal_link_health` | Internal link reachability (sampled) |

### AI commentary and GEO subscores (`lib/scoring/anthropic-scores.ts`)

When the Anthropic path runs for a page, four **GEO** checks capture model-judged dimensions (0–100 scores mapped to pass/warn/fail):

| Key | Label (UI) |
|-----|------------|
| `ai_eeat` | AI: E-E-A-T signals |
| `ai_content_depth` | AI: content depth |
| `ai_scannability` | AI: scannability |
| `ai_entity_clarity` | AI: entity clarity |

The model also produces a short plain-text **comment** stored on the page (not a separate pass/warn row).

### PageSpeed Insights / Lighthouse (`lib/scoring/psi.ts`)

**Requires** `PSI_API_KEY`. If unset or PSI errors, this layer contributes nothing.

Category rollup checks (from Lighthouse category scores):

| Key | Label (UI) |
|-----|------------|
| `psi_seo` | Lighthouse SEO |
| `psi_best_practices` | Lighthouse best practices |
| `psi_performance` | Lighthouse performance |
| `psi_accessibility` | Lighthouse accessibility |

Core Web Vitals / lab audits (from Lighthouse audit numeric values when present):

| Key | Label (UI) |
|-----|------------|
| `psi_lcp` | LCP (mobile) |
| `psi_cls` | CLS (mobile) |
| `psi_inp` | INP (mobile) |
| `psi_mixed_content` | Mixed content |

Optional **desktop** performance rollup when `PSI_RUN_DESKTOP=1` or `PSI_DESKTOP=true`:

| Key | Label (UI) |
|-----|------------|
| `psi_performance_desktop` | Desktop Lighthouse performance |

### Site-wide origin probes (`lib/scoring/site-wide.ts`)

Once per audit, against the community website origin:

| Key | Label (UI) |
|-----|------------|
| `sitewide_origin` | Origin URL *(only if origin cannot be derived)* |
| `sitewide_robots_txt` | robots.txt reachable |
| `sitewide_ai_bot_access` | AI crawler access (GPTBot / ClaudeBot / PerplexityBot) |
| `sitewide_sitemap` | XML sitemap discoverable |

### Crawl graph (audited URL set) (`lib/scoring/crawl-graph.ts`)

Once per audit after pages are fetched; uses only links between URLs in this run.

| Key | Label (UI) |
|-----|------------|
| `crawl_graph_orphans` | Internal orphans (audited set) |
| `crawl_graph_depth` | Internal crawl depth (from seed) |
| `crawl_graph_generic_anchors` | Internal anchor text quality (sampled graph) |

### Chrome UX Report — origin field metrics (`lib/scoring/crux.ts`)

**Requires** `CRUX_API_KEY` or `PSI_API_KEY` (same GCP project often works when CrUX API is enabled). If no key or no dataset, you may see a single summary row with a warn explanation instead of metrics.

Possible rows (new audits use **phone** and **desktop** cohort keys; legacy rows may use the older keys without a form-factor prefix):

| Key | Label (UI) |
|-----|------------|
| `crux_api` | Chrome UX Report *(top-level failure only)* |
| `crux_phone_api` / `crux_desktop_api` | Chrome UX Report — Mobile (phone) / Desktop *(API or coverage message)* |
| `crux_phone_record` / `crux_desktop_record` | Chrome UX Report — cohort *(empty record)* |
| `crux_phone_empty` / `crux_desktop_empty` | Chrome UX Report — cohort *(no histograms)* |
| `crux_phone_data` / `crux_desktop_data` | Chrome UX Report — cohort *(summary “has data”)* |
| `crux_phone_lcp_p75` / `crux_desktop_lcp_p75` | CrUX LCP (p75) — cohort |
| `crux_phone_inp_p75` / `crux_desktop_inp_p75` | CrUX INP (p75) — cohort |
| `crux_phone_cls_p75` / `crux_desktop_cls_p75` | CrUX CLS (p75) — cohort |
| `crux_phone_fcp_p75` / `crux_desktop_fcp_p75` | CrUX FCP (p75) — cohort |
| `crux_lcp_p75` / `crux_inp_p75` / `crux_cls_p75` / `crux_fcp_p75` | Legacy CrUX metric keys *(older persisted audits)* |

---

## Manual checks (expert checklist)

These are **not** produced by the automated scorer. They are template rows for human review on the community and stored in `manual_check_results` (see `COMMUNITY_MANUAL_ITEMS` in `lib/checklists/community-manual.ts`).

### Crawlability

| Key | Label |
|-----|--------|
| `gsc_sitemap_submitted` | XML sitemap submitted in Google Search Console |
| `gsc_monitoring` | Google Search Console property verified and monitored |
| `crawl_budget_reviewed` | Crawl budget not wasted on low-value paths (manual review) |

### Site performance

| Key | Label |
|-----|--------|
| `real_device_spot_check` | Real-device spot check on priority pages (slow 3G / mid-tier phone) |
| `mixed_content_removed` | No mixed-content or SSL certificate issues in browser + GSC |
| `broken_links_reviewed` | Broken links and redirect chains reviewed (crawler or Screaming Frog) |

### SEO — on-page

| Key | Label |
|-----|--------|
| `seo_topics_editorial` | Editorial fit: page topics, heading intent, keyword focus, and hub-to-spoke internal journeys |

### SEO — off-page and authority

| Key | Label |
|-----|--------|
| `backlink_toxic_review` | Backlink profile reviewed — no toxic patterns (Disavow if needed) |
| `care_industry_links` | At least 3 authoritative inbound links from care / health industry sources |
| `outbound_authority_links` | Outbound authority references on key pages (gov, associations, research) |
| `gbp_optimized` | Google Business Profile active and fully optimized |

### Local SEO and NAP

| Key | Label |
|-----|--------|
| `nap_directories` | NAP consistent across major directories (manual audit) |
| `eldercare_directories` | Listed on relevant elder-care directories where applicable |
| `reviews_program` | Reviews actively collected on Google, Yelp, and niche directories |

### Content and GEO readiness

| Key | Label |
|-----|--------|
| `geo_content_structure` | Skimmable answer structure: summaries, lists, modular sections, visuals/tables where they help |
| `geo_content_voice` | Voice and readability for seniors/families (tone, jargon, hedging, paragraph flow, topical variety) |
| `geo_content_proof` | Proof and specificity: metrics/timelines for claims + acronyms defined on first use |

### Niche — elderly care GEO

| Key | Label |
|-----|--------|
| `geo_niche_offerings` | Care offerings storytelling: priority facility lines, comparisons (e.g. SNF vs ALF), pain-point coverage, conversational/voice intent where relevant |
| `geo_niche_trust` | Trust signals: regulator/agency wording, associations/research cites, authoritative statistics, testimonials/case studies with specifics |

---

## Related files

| Area | Path |
|------|------|
| Deterministic per-page checks | `lib/scoring/deterministic.ts` |
| Offline schema heuristics | `lib/scoring/schema-heuristic.ts` |
| Anthropic GEO subscores | `lib/scoring/anthropic-scores.ts` |
| PSI / Lighthouse | `lib/scoring/psi.ts` |
| Site-wide probes | `lib/scoring/site-wide.ts` |
| CrUX origin metrics | `lib/scoring/crux.ts` |
| Manual checklist template | `lib/checklists/community-manual.ts` |
