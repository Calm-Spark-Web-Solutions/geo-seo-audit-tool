/**
 * Page-role inference and schema recommendations for the Structured data
 * inspector. Host-agnostic: uses URL patterns, JSON-LD, and title/H1 only.
 * Does not affect automated pass/warn scoring (inspector-only).
 */

import {
  ABOUT_PATH_RE,
  ABOUT_SEGMENTS,
  BLOG_PATH_RE,
  CONTACT_PATH_RE,
  CONTACT_SEGMENTS,
  FACILITY_PATH_RE,
  FACILITY_SEGMENTS,
  FAQ_PATH_RE,
  FAQ_SEGMENTS,
  LISTING_PATH_RE,
  LISTING_SEGMENTS,
  SERVICE_PATH_RE,
  SERVICE_SEGMENTS,
} from "./page-schema-path-patterns";

export {
  FACILITY_PATH_RE,
  SERVICE_PATH_RE,
} from "./page-schema-path-patterns";

export type PageSchemaRole =
  | "homepage"
  | "contact"
  | "about"
  | "service"
  | "facility"
  | "faq"
  | "blog"
  | "listing"
  | "generic";

export type SchemaInferenceConfidence = "high" | "medium" | "low";

export type SchemaRecommendationPriority = "required" | "recommended" | "optional";

/** Logical schema keys used in recommendations (may map to several @types). */
export type SchemaRecommendationKey =
  | "local_entity"
  | "website"
  | "webpage"
  | "contact_page"
  | "about_page"
  | "service"
  | "place"
  | "faq_page"
  | "article"
  | "item_list"
  | "breadcrumb";

export interface SchemaRecommendation {
  key: SchemaRecommendationKey;
  label: string;
  priority: SchemaRecommendationPriority;
  why: string;
}

export type SchemaFitStatus = "present" | "missing";

export interface SchemaFitRow extends SchemaRecommendation {
  status: SchemaFitStatus;
}

export interface PageSchemaRoleMeta {
  role: PageSchemaRole;
  confidence: SchemaInferenceConfidence;
  reason: string;
}

export interface InferPageSchemaRoleInput {
  pageUrl: string;
  hints?: { title?: string; h1?: string };
  detectedTypes?: Iterable<string>;
}

const ORG_TYPES = new Set([
  "Organization",
  "LocalBusiness",
  "MedicalOrganization",
  "MedicalBusiness",
]);

const SERVICE_TYPES = new Set(["Service", "ProfessionalService"]);

const PLACE_TYPES = new Set([
  "Place",
  "LodgingBusiness",
  "Residence",
  "Accommodation",
]);

const ARTICLE_TYPES = new Set(["Article", "BlogPosting", "NewsArticle"]);

const ROLE_LABELS: Record<PageSchemaRole, string> = {
  homepage: "Homepage",
  contact: "Contact / directions",
  about: "About",
  service: "Service / offering page",
  facility: "Facilities / amenities",
  faq: "FAQ",
  blog: "Blog / news",
  listing: "Listing / gallery hub",
  generic: "General page",
};

export function pageSchemaRoleLabel(role: PageSchemaRole): string {
  return ROLE_LABELS[role];
}

function normalizePath(pathname: string): string {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p.toLowerCase();
}

function pathSegment(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function matchesSegment(path: string, patterns: RegExp[]): boolean {
  const seg = pathSegment(path);
  return patterns.some((re) => re.test(seg));
}

function isHomepagePath(path: string): boolean {
  return path === "/" || path === "/index" || path === "/index.html" || path === "/home";
}

function titleHintsContact(text: string): boolean {
  return /\b(contact|direction|get in touch|reach us|visit us|office hours|schedule a tour|request info|find us)\b/i.test(
    text,
  );
}

function titleHintsAbout(text: string): boolean {
  return /\b(about us|our story|who we are|our team|leadership|mission|history)\b/i.test(
    text,
  );
}

function titleHintsFaq(text: string): boolean {
  return /\b(faq|frequently asked)\b/i.test(text);
}

function titleHintsFacility(text: string): boolean {
  return /\b(campus|amenities|facilities|grounds|virtual tour|campus map|recreation|activities|our location)\b/i.test(
    text,
  );
}

function titleHintsService(text: string): boolean {
  return /\b(our services|what we offer|solutions|products|service line|assisted living|memory care|skilled nursing|health services|independent living|respite|hospice|level of care)\b/i.test(
    text,
  );
}

function titleHintsDiningMenu(text: string): boolean {
  return /\b(menu|dining room|culinary)\b/i.test(text);
}

function roleFromJsonLd(
  detected: Set<string>,
  path: string,
): { role: PageSchemaRole; reason: string } | null {
  if (isHomepagePath(path)) return null;

  if ([...ARTICLE_TYPES].some((t) => detected.has(t))) {
    return { role: "blog", reason: "JSON-LD includes Article or BlogPosting on this URL." };
  }
  if (detected.has("FAQPage")) {
    return { role: "faq", reason: "JSON-LD includes FAQPage on this URL." };
  }
  if (detected.has("ContactPage")) {
    return { role: "contact", reason: "JSON-LD includes ContactPage on this URL." };
  }
  if (detected.has("AboutPage")) {
    return { role: "about", reason: "JSON-LD includes AboutPage on this URL." };
  }
  return null;
}

type UrlRoleMatch = { role: PageSchemaRole; confidence: SchemaInferenceConfidence; reason: string };

function roleFromUrl(path: string, hintText: string): UrlRoleMatch {
  if (isHomepagePath(path)) {
    return {
      role: "homepage",
      confidence: "high",
      reason: "URL is the site homepage.",
    };
  }

  if (matchesSegment(path, CONTACT_SEGMENTS) || CONTACT_PATH_RE.test(path)) {
    return {
      role: "contact",
      confidence: "high",
      reason: `Matched contact URL path: ${pathSegment(path) || path}.`,
    };
  }

  if (matchesSegment(path, ABOUT_SEGMENTS) || ABOUT_PATH_RE.test(path)) {
    return {
      role: "about",
      confidence: "high",
      reason: `Matched about URL path: ${pathSegment(path) || path}.`,
    };
  }

  if (matchesSegment(path, FAQ_SEGMENTS) || FAQ_PATH_RE.test(path)) {
    return {
      role: "faq",
      confidence: "high",
      reason: `Matched FAQ URL path: ${pathSegment(path) || path}.`,
    };
  }

  if (BLOG_PATH_RE.test(path)) {
    return {
      role: "blog",
      confidence: "high",
      reason: "URL is under a blog or news section.",
    };
  }

  if (matchesSegment(path, LISTING_SEGMENTS) || LISTING_PATH_RE.test(path)) {
    return {
      role: "listing",
      confidence: "medium",
      reason: `Matched listing or hub URL path: ${pathSegment(path) || path}.`,
    };
  }

  if (matchesSegment(path, FACILITY_SEGMENTS) || FACILITY_PATH_RE.test(path)) {
    return {
      role: "facility",
      confidence: "medium",
      reason: `Matched facilities or amenities URL path: ${pathSegment(path) || path}.`,
    };
  }

  if (matchesSegment(path, SERVICE_SEGMENTS) || SERVICE_PATH_RE.test(path)) {
    return {
      role: "service",
      confidence: "medium",
      reason: `Matched service or offering URL path: ${pathSegment(path) || path}.`,
    };
  }

  if (hintText) {
    if (titleHintsContact(hintText)) {
      return {
        role: "contact",
        confidence: "medium",
        reason: "Title or H1 suggests contact or directions content.",
      };
    }
    if (titleHintsAbout(hintText)) {
      return {
        role: "about",
        confidence: "medium",
        reason: "Title or H1 suggests about or team content.",
      };
    }
    if (titleHintsFaq(hintText)) {
      return {
        role: "faq",
        confidence: "medium",
        reason: "Title or H1 suggests FAQ content.",
      };
    }
    if (titleHintsFacility(hintText)) {
      return {
        role: "facility",
        confidence: "medium",
        reason: "Title or H1 suggests facilities or amenities content.",
      };
    }
    if (titleHintsDiningMenu(hintText)) {
      return {
        role: "facility",
        confidence: "medium",
        reason: "Title or H1 suggests dining amenity or menu content (not a dedicated offering page).",
      };
    }
    if (titleHintsService(hintText)) {
      return {
        role: "service",
        confidence: "medium",
        reason: "Title or H1 suggests a specific product or service offering.",
      };
    }
  }

  return {
    role: "generic",
    confidence: "low",
    reason: "No strong URL, content, or JSON-LD signal — treating as a general interior page.",
  };
}

/**
 * Infer page role from URL and optional title/H1 hints (URL/hints only).
 */
export function inferPageSchemaRole(
  pageUrl: string,
  hints?: { title?: string; h1?: string },
): PageSchemaRole {
  return inferPageSchemaRoleWithMeta({ pageUrl, hints }).role;
}

/**
 * Infer role using JSON-LD (first), then URL buckets, then title/H1 hints.
 */
export function inferPageSchemaRoleWithMeta(
  input: InferPageSchemaRoleInput,
): PageSchemaRoleMeta {
  let path = "/";
  try {
    path = normalizePath(new URL(input.pageUrl).pathname);
  } catch {
    /* keep default */
  }

  const hintText = [input.hints?.title, input.hints?.h1].filter(Boolean).join(" ");
  const detected =
    input.detectedTypes != null ? new Set(input.detectedTypes) : new Set<string>();

  const fromLd = roleFromJsonLd(detected, path);
  if (fromLd) {
    return {
      role: fromLd.role,
      confidence: "high",
      reason: fromLd.reason,
    };
  }

  return roleFromUrl(path, hintText);
}

export function getSchemaRecommendations(role: PageSchemaRole): SchemaRecommendation[] {
  switch (role) {
    case "homepage":
      return [
        {
          key: "local_entity",
          label: "Organization / LocalBusiness / MedicalOrganization",
          priority: "required",
          why: "Defines who you are for AI and local search on the main entry point.",
        },
        {
          key: "website",
          label: "WebSite",
          priority: "required",
          why: "Sitewide identity; often includes publisher linkage and search actions.",
        },
        {
          key: "webpage",
          label: "WebPage",
          priority: "recommended",
          why: "Clarifies this URL as the primary landing page.",
        },
        {
          key: "service",
          label: "Service summaries",
          priority: "optional",
          why: "Optional summaries of offerings; not a substitute for dedicated offering pages.",
        },
        {
          key: "faq_page",
          label: "FAQPage",
          priority: "optional",
          why: "Only if this page includes real Q&A content—not required on every homepage.",
        },
      ];
    case "contact":
      return [
        {
          key: "contact_page",
          label: "ContactPage",
          priority: "required",
          why: "Signals a contact/directions intent to crawlers.",
        },
        {
          key: "local_entity",
          label: "Local entity with NAP",
          priority: "required",
          why: "Structured address and telephone on Organization / LocalBusiness.",
        },
        {
          key: "webpage",
          label: "WebPage",
          priority: "recommended",
          why: "Ties the URL to contact content when ContactPage is not used alone.",
        },
      ];
    case "about":
      return [
        {
          key: "about_page",
          label: "AboutPage",
          priority: "required",
          why: "Marks the page as brand/entity narrative, not a service listing.",
        },
        {
          key: "local_entity",
          label: "Organization / LocalBusiness",
          priority: "required",
          why: "Reinforces who the organization is on the about story page.",
        },
        {
          key: "webpage",
          label: "WebPage",
          priority: "recommended",
          why: "Standard page-level markup for the about URL.",
        },
      ];
    case "service":
      return [
        {
          key: "service",
          label: "Service",
          priority: "required",
          why: "Describes the specific offering; link provider to your organization.",
        },
        {
          key: "webpage",
          label: "WebPage",
          priority: "recommended",
          why: "Page-level context for this service URL.",
        },
        {
          key: "local_entity",
          label: "Organization / LocalBusiness (provider)",
          priority: "recommended",
          why: "Provider reference so AI connects the offering to your business.",
        },
        {
          key: "breadcrumb",
          label: "BreadcrumbList",
          priority: "optional",
          why: "Helps parsers understand site hierarchy for interior pages.",
        },
      ];
    case "facility":
      return [
        {
          key: "webpage",
          label: "WebPage",
          priority: "required",
          why: "Base page type for facilities, amenities, and lifestyle content.",
        },
        {
          key: "place",
          label: "Place",
          priority: "recommended",
          why: "Describes the physical location or amenity environment—not a dedicated offering page.",
        },
        {
          key: "local_entity",
          label: "Organization / LocalBusiness",
          priority: "recommended",
          why: "Links the page to your business entity (often sitewide JSON-LD).",
        },
        {
          key: "breadcrumb",
          label: "BreadcrumbList",
          priority: "optional",
          why: "Helps parsers understand site hierarchy for interior pages.",
        },
        {
          key: "service",
          label: "Service",
          priority: "optional",
          why: "Only if this page explicitly describes a named offering—not typical for facility overview pages.",
        },
      ];
    case "faq":
      return [
        {
          key: "faq_page",
          label: "FAQPage",
          priority: "required",
          why: "Primary type for Q&A content and rich-result eligibility.",
        },
        {
          key: "webpage",
          label: "WebPage",
          priority: "recommended",
          why: "Page wrapper when FAQPage is nested in a graph.",
        },
        {
          key: "local_entity",
          label: "Organization / LocalBusiness",
          priority: "optional",
          why: "Optional publisher linkage; often inherited from sitewide JSON-LD.",
        },
      ];
    case "blog":
      return [
        {
          key: "article",
          label: "Article / BlogPosting",
          priority: "required",
          why: "Editorial content should use article types, not ContactPage or Service alone.",
        },
        {
          key: "webpage",
          label: "WebPage",
          priority: "recommended",
          why: "Wraps the post URL in the JSON-LD graph.",
        },
        {
          key: "breadcrumb",
          label: "BreadcrumbList",
          priority: "optional",
          why: "Useful for post hierarchy under /blog or /news.",
        },
      ];
    case "listing":
      return [
        {
          key: "webpage",
          label: "WebPage",
          priority: "required",
          why: "Base page type for galleries, catalogs, careers hubs, etc.",
        },
        {
          key: "item_list",
          label: "ItemList",
          priority: "recommended",
          why: "Appropriate when the page is a catalog of items (plans, photos, jobs).",
        },
        {
          key: "local_entity",
          label: "Organization / LocalBusiness",
          priority: "optional",
          why: "Often provided sitewide; not required on every listing URL.",
        },
      ];
    case "generic":
      return [
        {
          key: "webpage",
          label: "WebPage",
          priority: "recommended",
          why: "Baseline page-level markup when role is unclear.",
        },
        {
          key: "local_entity",
          label: "Organization / LocalBusiness",
          priority: "optional",
          why: "May live in sitewide JSON-LD rather than on every interior URL.",
        },
      ];
  }
}

function satisfiesRecommendation(
  key: SchemaRecommendationKey,
  detected: Set<string>,
): boolean {
  switch (key) {
    case "local_entity":
      return [...ORG_TYPES].some((t) => detected.has(t));
    case "website":
      return detected.has("WebSite");
    case "webpage":
      return detected.has("WebPage");
    case "contact_page":
      return detected.has("ContactPage");
    case "about_page":
      return detected.has("AboutPage");
    case "service":
      return [...SERVICE_TYPES].some((t) => detected.has(t));
    case "place":
      return [...PLACE_TYPES].some((t) => detected.has(t));
    case "faq_page":
      return detected.has("FAQPage");
    case "article":
      return [...ARTICLE_TYPES].some((t) => detected.has(t));
    case "item_list":
      return detected.has("ItemList");
    case "breadcrumb":
      return detected.has("BreadcrumbList");
    default:
      return false;
  }
}

export function evaluateSchemaFit(
  role: PageSchemaRole,
  detectedTypes: Iterable<string>,
): SchemaFitRow[] {
  const detected = new Set(detectedTypes);
  return getSchemaRecommendations(role).map((rec) => ({
    ...rec,
    status: satisfiesRecommendation(rec.key, detected) ? "present" : "missing",
  }));
}
