/**
 * Friendly labeling for sitemap shard files.
 *
 * Real CMSes (especially WordPress + Yoast / Rank Math) split sitemaps by
 * post type — `page-sitemap.xml`, `post-sitemap.xml`, `category-sitemap.xml`,
 * etc. — and we want to surface that as readable categories on the
 * "Run new audit" form.
 *
 * Default selection state: most-useful types are pre-checked, low-signal
 * types (attachments, tags) are off. Unknown types render with a titlecased
 * filename and are pre-checked so we don't silently exclude content.
 */

interface ShardSpec {
  pattern: RegExp;
  label: string;
  /** Smaller = surfaced higher in the UI. */
  priority: number;
  /** Default selected state on the form. */
  defaultChecked: boolean;
}

const KNOWN_SHARDS: ShardSpec[] = [
  {
    pattern: /(^|[/_-])pages?[-_]?sitemap/i,
    label: "Pages",
    priority: 0,
    defaultChecked: true,
  },
  {
    pattern: /(^|[/_-])posts?[-_]?sitemap/i,
    label: "Posts",
    priority: 1,
    defaultChecked: true,
  },
  {
    pattern: /(^|[/_-])(category|categories)[-_]?sitemap/i,
    label: "Categories",
    priority: 2,
    defaultChecked: true,
  },
  {
    pattern: /(^|[/_-])products?[-_]?sitemap/i,
    label: "Products",
    priority: 3,
    defaultChecked: true,
  },
  {
    pattern: /(^|[/_-])news[-_]?sitemap/i,
    label: "News",
    priority: 4,
    defaultChecked: true,
  },
  {
    pattern: /(^|[/_-])tags?[-_]?sitemap/i,
    label: "Tags",
    priority: 7,
    defaultChecked: false,
  },
  {
    pattern: /(^|[/_-])authors?[-_]?sitemap/i,
    label: "Authors",
    priority: 8,
    defaultChecked: false,
  },
  {
    pattern: /(^|[/_-])attachments?[-_]?sitemap/i,
    label: "Attachments",
    priority: 9,
    defaultChecked: false,
  },
];

const UNKNOWN_PRIORITY = 5;

export interface ShardDescriptor {
  label: string;
  priority: number;
  defaultChecked: boolean;
}

/**
 * Resolve a shard URL to a human label, sort priority, and a sensible
 * default-checked state. Falls back to titlecasing the filename
 * (`news-sitemap.xml` -> "News") for shards we don't recognize.
 */
export function describeShard(shardUrl: string): ShardDescriptor {
  const filename = filenameOf(shardUrl);
  for (const spec of KNOWN_SHARDS) {
    if (spec.pattern.test(filename) || spec.pattern.test(shardUrl)) {
      return {
        label: spec.label,
        priority: spec.priority,
        defaultChecked: spec.defaultChecked,
      };
    }
  }
  return {
    label: titlecaseFromFilename(filename),
    priority: UNKNOWN_PRIORITY,
    defaultChecked: true,
  };
}

function filenameOf(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last ?? u.pathname;
  } catch {
    return url;
  }
}

function titlecaseFromFilename(filename: string): string {
  // Strip extension(s), drop trailing -sitemap / _sitemap, normalize
  // separators, then titlecase each word.
  const stem = filename
    .replace(/\.[a-z0-9]+(?:\.gz)?$/i, "")
    .replace(/[-_]?sitemap$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  if (!stem) return "All pages";
  return stem
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
