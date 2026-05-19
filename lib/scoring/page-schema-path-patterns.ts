/**
 * Host-agnostic URL path patterns for page-role inference.
 * UNIVERSAL: any local-business site. SENIOR_LIVING: additive CCRC / senior-living slugs.
 */

/** Last path segment matchers (case-insensitive). */
export type SegmentPatterns = RegExp[];

function joinPathAlternation(segments: string[]): string {
  return segments.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}

function pathRe(segments: string[]): RegExp {
  return new RegExp(`\\/(${joinPathAlternation(segments)})(\\/|$)`, "i");
}

// --- Contact ---

export const UNIVERSAL_CONTACT_SEGMENTS: SegmentPatterns = [
  /^contact$/i,
  /^contact-us$/i,
  /^get-in-touch$/i,
  /^directions$/i,
  /^visit$/i,
  /^schedule-a-tour$/i,
  /^request-info$/i,
  /^get-started$/i,
  /^find-us$/i,
];

export const CONTACT_SEGMENTS: SegmentPatterns = [...UNIVERSAL_CONTACT_SEGMENTS];

export const CONTACT_PATH_RE = pathRe([
  "contact",
  "directions",
  "get-in-touch",
  "schedule-a-tour",
  "request-info",
  "get-started",
  "find-us",
]);

// --- About ---

export const UNIVERSAL_ABOUT_SEGMENTS: SegmentPatterns = [
  /^about$/i,
  /^about-us$/i,
  /^our-story$/i,
  /^who-we-are$/i,
  /^team$/i,
  /^leadership$/i,
  /^mission$/i,
  /^history$/i,
];

export const ABOUT_SEGMENTS: SegmentPatterns = [...UNIVERSAL_ABOUT_SEGMENTS];

export const ABOUT_PATH_RE = pathRe([
  "about",
  "our-story",
  "who-we-are",
  "team",
  "leadership",
  "mission",
  "history",
]);

// --- FAQ ---

export const FAQ_SEGMENTS: SegmentPatterns = [/^faq$/i, /^faqs$/i];

export const FAQ_PATH_RE = /\/faq(s)?(\/|$)/i;

// --- Blog ---

export const BLOG_PATH_RE = /\/(blog|news|articles|insights|press)(\/|$)/i;

// --- Listing / hub ---

export const UNIVERSAL_LISTING_SEGMENTS: SegmentPatterns = [
  /^gallery$/i,
  /^photo-gallery$/i,
  /^careers$/i,
  /^jobs$/i,
  /^openings$/i,
  /^photos$/i,
  /^videos$/i,
  /^resources$/i,
  /^events$/i,
  /^shop$/i,
];

export const SENIOR_LIVING_LISTING_SEGMENTS: SegmentPatterns = [
  /^floor-plans?$/i,
  /^current-openings$/i,
  /^media-room$/i,
];

export const LISTING_SEGMENTS: SegmentPatterns = [
  ...UNIVERSAL_LISTING_SEGMENTS,
  ...SENIOR_LIVING_LISTING_SEGMENTS,
];

export const LISTING_PATH_RE = pathRe([
  "floor-plans",
  "gallery",
  "photo-gallery",
  "careers",
  "current-openings",
  "media-room",
  "events",
  "jobs",
  "openings",
  "photos",
  "videos",
  "resources",
  "shop",
]);

// --- Facility / amenities (checked before service) ---

export const UNIVERSAL_FACILITY_SEGMENTS: SegmentPatterns = [
  /^amenities$/i,
  /^campus$/i,
  /^campus-map$/i,
  /^virtual-tour$/i,
  /^tour$/i,
  /^facilities$/i,
  /^facility$/i,
  /^grounds$/i,
  /^amenity$/i,
  /^life-at$/i,
  /^lifestyle$/i,
  /^activities$/i,
  /^recreation$/i,
  /^explore$/i,
  /^experience$/i,
];

/** Common on senior-living / CCRC sites; not tied to any single client domain. */
export const SENIOR_LIVING_FACILITY_SEGMENTS: SegmentPatterns = [
  /^our-campus$/i,
  /^community-life$/i,
  /^social-and-fitness$/i,
  /^wellness$/i,
  /^residences$/i,
];

export const FACILITY_SEGMENTS: SegmentPatterns = [
  ...UNIVERSAL_FACILITY_SEGMENTS,
  ...SENIOR_LIVING_FACILITY_SEGMENTS,
];

export const FACILITY_PATH_RE = pathRe([
  "amenities",
  "campus",
  "campus-map",
  "virtual-tour",
  "tour",
  "facilities",
  "facility",
  "grounds",
  "amenity",
  "life-at",
  "lifestyle",
  "activities",
  "recreation",
  "explore",
  "experience",
  "our-campus",
  "community-life",
  "social-and-fitness",
  "wellness",
  "residences",
]);

// --- Service / offering pages ---

export const UNIVERSAL_SERVICE_SEGMENTS: SegmentPatterns = [
  /^services$/i,
  /^solutions$/i,
  /^products$/i,
  /^offerings$/i,
  /^what-we-do$/i,
  /^industries$/i,
  /^specialties$/i,
  /^programs$/i,
  /^costs?$/i,
  /^pricing$/i,
  /-care$/i,
];

/** Care-level and life-plan slugs common on senior-living sites. */
export const SENIOR_LIVING_SERVICE_SEGMENTS: SegmentPatterns = [
  /^assisted-living$/i,
  /^memory-care$/i,
  /^skilled-nursing$/i,
  /^health-services$/i,
  /^independent-living$/i,
  /^respite$/i,
  /^hospice$/i,
  /^rehab$/i,
  /^dining$/i,
  /^living-options$/i,
  /^levels-of-care$/i,
];

export const SERVICE_SEGMENTS: SegmentPatterns = [
  ...UNIVERSAL_SERVICE_SEGMENTS,
  ...SENIOR_LIVING_SERVICE_SEGMENTS,
];

export const SERVICE_PATH_RE = pathRe([
  "services",
  "solutions",
  "products",
  "offerings",
  "what-we-do",
  "industries",
  "specialties",
  "programs",
  "costs",
  "pricing",
  "assisted-living",
  "memory-care",
  "skilled-nursing",
  "health-services",
  "independent-living",
  "respite",
  "hospice",
  "rehab",
  "dining",
  "living-options",
  "levels-of-care",
]);
