import type { CheckResult } from "@/types";

export type CruxVitalId = "lcp" | "inp" | "cls" | "fcp";

export type CruxFormFactorId = "phone" | "desktop";

export const CRUX_FORM_FACTORS: readonly {
  id: CruxFormFactorId;
  label: string;
  /** Shown first in the vitals overview; desktop is the default primary cohort. */
  primary?: boolean;
}[] = [
  { id: "desktop", label: "Desktop", primary: true },
  { id: "phone", label: "Mobile (phone)" },
] as const;

export const CRUX_VITAL_BASE: readonly {
  id: CruxVitalId;
  abbrev: string;
  fullName: string;
}[] = [
  {
    id: "lcp",
    abbrev: "LCP",
    fullName: "Largest Contentful Paint",
  },
  {
    id: "inp",
    abbrev: "INP",
    fullName: "Interaction to Next Paint",
  },
  {
    id: "cls",
    abbrev: "CLS",
    fullName: "Cumulative Layout Shift",
  },
  {
    id: "fcp",
    abbrev: "FCP",
    fullName: "First Contentful Paint",
  },
] as const;

/** Stable check key for CrUX histogram rows (phone / desktop cohorts). */
export function cruxMetricCheckKey(
  form: CruxFormFactorId,
  vital: CruxVitalId,
): string {
  return `crux_${form}_${vital}_p75`;
}

/** Legacy keys from audits before phone/desktop split (no form factor in key). */
export const CRUX_VITAL_SLOTS: readonly {
  id: CruxVitalId;
  checkKey: string;
  abbrev: string;
  fullName: string;
}[] = [
  {
    id: "lcp",
    checkKey: "crux_lcp_p75",
    abbrev: "LCP",
    fullName: "Largest Contentful Paint",
  },
  {
    id: "inp",
    checkKey: "crux_inp_p75",
    abbrev: "INP",
    fullName: "Interaction to Next Paint",
  },
  {
    id: "cls",
    checkKey: "crux_cls_p75",
    abbrev: "CLS",
    fullName: "Cumulative Layout Shift",
  },
  {
    id: "fcp",
    checkKey: "crux_fcp_p75",
    abbrev: "FCP",
    fullName: "First Contentful Paint",
  },
] as const;

export type CruxBeginnerBlock = {
  what: string;
  targetLine: string;
  tips: string[];
};

export function getCruxBeginnerCopy(
  id: CruxVitalId,
  result: CheckResult,
): CruxBeginnerBlock {
  switch (id) {
    case "lcp":
      return lcpCopy(result);
    case "inp":
      return inpCopy(result);
    case "cls":
      return clsCopy(result);
    case "fcp":
      return fcpCopy(result);
  }
}

function lcpCopy(result: CheckResult): CruxBeginnerBlock {
  const what =
    "How fast the largest visible piece of content (often a hero image or heading block) appears after navigation.";
  const targetLine =
    "Good: under about 2.5 seconds for most visitors (p75).";
  if (result === "pass") {
    return {
      what,
      targetLine,
      tips: [
        "Keep hero images sized correctly and avoid huge uncompressed files after redesigns.",
      ],
    };
  }
  if (result === "warn") {
    return {
      what,
      targetLine,
      tips: [
        "Find the LCP element in Lighthouse or DevTools and shrink or compress it.",
        "Cut render-blocking scripts and heavy fonts above the fold.",
        "Improve server response time (hosting, cache, CDN).",
      ],
    };
  }
  return {
    what,
    targetLine,
    tips: [
      "Treat image/video weight as the top lever—correct dimensions, modern formats, CDN.",
      "Defer non-critical JavaScript and shorten the critical request chain.",
      "Speed up TTFB (slow APIs, cold starts, missing cache).",
    ],
  };
}

function inpCopy(result: CheckResult): CruxBeginnerBlock {
  const what =
    "How quickly the page responds after someone taps, clicks, or types—smoothness of interactions.";
  const targetLine =
    "Good: under about 200 ms delay (p75).";
  if (result === "pass") {
    return {
      what,
      targetLine,
      tips: [
        "Stay lean on third-party widgets and retest after adding chat or analytics.",
      ],
    };
  }
  if (result === "warn") {
    return {
      what,
      targetLine,
      tips: [
        "Break up long JavaScript tasks so the browser can respond between chunks.",
        "Delay or remove heavy scripts that run right after clicks.",
        "Avoid forced layout work during input handlers.",
      ],
    };
  }
  return {
    what,
    targetLine,
    tips: [
      "Profile a real click path in DevTools Performance.",
      "Remove or async-load third parties that hog the main thread.",
      "Simplify handlers and fix layout thrashing after interactions.",
    ],
  };
}

function clsCopy(result: CheckResult): CruxBeginnerBlock {
  const what =
    "Layout stability: how much content jumps around while the page loads. Higher CLS means more shifting.";
  const targetLine =
    "Good: about 0.1 or lower (p75). Lower is better—0 means no unexpected shift.";
  if (result === "pass") {
    return {
      what,
      targetLine,
      tips: [
        "Keep setting width/height on images and reserving space for embeds when you change templates.",
      ],
    };
  }
  if (result === "warn") {
    return {
      what,
      targetLine,
      tips: [
        "Give images, videos, and ads fixed space (dimensions or aspect-ratio) before they load.",
        "Avoid inserting banners or cookie bars that push content down after paint.",
        "Load fonts in a way that doesn’t swap sizes wildly (preload, size-adjust, fallbacks).",
      ],
    };
  }
  return {
    what,
    targetLine,
    tips: [
      "Fix the biggest jumps first: missing image sizes, late-loading ads, and embeds that resize their container.",
      "Don’t inject content above what the user is already reading.",
      "Prefer animations that use transform/opacity instead of properties that move layout.",
    ],
  };
}

function fcpCopy(result: CheckResult): CruxBeginnerBlock {
  const what =
    "When the first text or image becomes visible—your first “something appeared” moment.";
  const targetLine =
    "Good: under about 1.8 seconds (p75), rough guide.";
  if (result === "pass") {
    return {
      what,
      targetLine,
      tips: [
        "Keep HTML and critical CSS lean when you add new global scripts.",
      ],
    };
  }
  if (result === "warn") {
    return {
      what,
      targetLine,
      tips: [
        "Reduce render-blocking CSS and JS in the document head.",
        "Improve server response time and enable compression / HTTP/2.",
        "Preload only the fonts you truly need above the fold.",
      ],
    };
  }
  return {
    what,
    targetLine,
    tips: [
      "Speed up first byte (hosting, redirects, database/API latency).",
      "Defer everything that isn’t needed for first paint.",
      "Serve static assets from a CDN with long cache lifetimes.",
    ],
  };
}
