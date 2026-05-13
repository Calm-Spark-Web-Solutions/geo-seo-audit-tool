import { normalizeUrl } from "@/lib/crawler/normalize";
import type { AuditCheck, CheckResult } from "@/types";

import { scoreFromResult } from "./deterministic";

const CRUX_ENDPOINT =
  "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
const CRUX_TIMEOUT_MS = 15_000;

type CruxFormFactor = "PHONE" | "DESKTOP";

function row(
  key: string,
  label: string,
  result: CheckResult,
  explanation: string,
): AuditCheck {
  return {
    key,
    label,
    result,
    explanation,
    score: scoreFromResult(result),
    category: "Field metrics (CrUX)",
    pillar: "GEO",
  };
}

function metricRow(
  key: string,
  label: string,
  result: CheckResult,
  explanation: string,
  sample: { value: number; unit: "ms" | "cls" },
): AuditCheck {
  return {
    ...row(key, label, result, explanation),
    cruxSample: sample,
  };
}

function joinExplanation(base: string, suggestions: string): string {
  const s = suggestions.trim();
  if (!s) return base;
  return `${base}\n\n${s}`;
}

function lcpSuggestions(result: CheckResult): string {
  if (result === "pass") {
    return (
      "How to keep LCP strong: size images for viewport (srcset), use modern formats (AVIF/WebP), avoid oversized hero media, keep render-blocking scripts minimal, and watch server/TTFB after deploys."
    );
  }
  if (result === "warn") {
    return (
      "How to improve LCP: find the LCP element (Chrome DevTools → Performance / Lighthouse). Compress and right-size the largest above-the-fold image or video poster, add fetchpriority=\"high\" where appropriate, reduce render-blocking CSS/JS, preload critical fonts, and shorten server response time (CDN, caching, hosting)."
    );
  }
  return (
    "How to improve LCP (priority): optimize or replace the LCP image/video (dimensions, compression, CDN), eliminate long critical-request chains, defer non-critical JavaScript, split large bundles, improve TTFB (hosting, edge cache, DB/API latency), and avoid heavy client-only rendering for first paint."
  );
}

function inpSuggestions(result: CheckResult): string {
  if (result === "pass") {
    return (
      "How to keep INP low: avoid long main-thread tasks after taps, audit third-party tags, and test interactions on mid-tier devices."
    );
  }
  if (result === "warn") {
    return (
      "How to improve INP: break up long JavaScript tasks (yield to the main thread), defer or remove slow third-party widgets, reduce input-delay handlers, avoid forced synchronous layouts after interactions, and consider moving heavy work off the main thread where possible."
    );
  }
  return (
    "How to improve INP (priority): profile interactions in DevTools (Performance with click recording), remove or async-load blocking third parties, simplify event handlers, code-split below-the-fold features, and fix layout thrashing after user input."
  );
}

function clsSuggestions(result: CheckResult): string {
  if (result === "pass") {
    return (
      "How to keep CLS stable: always set width/height on images and embeds, reserve space for ads and dynamic slots, and prefer transform/opacity for animations."
    );
  }
  if (result === "warn") {
    return (
      "How to improve CLS: add explicit dimensions to images, videos, and iframes; reserve space for ads/embeds before they load; avoid inserting banners above existing content; use font-display: optional/swap with size-adjust fallbacks; prefer CSS transforms over properties that shift layout."
    );
  }
  return (
    "How to improve CLS (priority): eliminate layout jumps from late-loading images and ads (aspect-ratio boxes, skeletons), fix web fonts (preload, subset, avoid invisible text flashes), stop injecting content above the fold after load, and audit third-party embeds that resize containers."
  );
}

function fcpSuggestions(result: CheckResult): string {
  if (result === "pass") {
    return (
      "How to keep FCP fast: keep critical HTML/CSS lean, cache static assets, and avoid blocking scripts in the document head when possible."
    );
  }
  if (result === "warn") {
    return (
      "How to improve FCP: reduce render-blocking CSS/JS in the head, inline only truly critical CSS, preload key fonts, improve server/TTFB, and remove unused CSS from the critical path."
    );
  }
  return (
    "How to improve FCP (priority): shorten server response and redirects, defer non-critical JS, split CSS, enable compression and HTTP/2/3, use a CDN for static assets, and minimize HTML payload before first paint."
  );
}

function readP75(metric: unknown): number | undefined {
  if (!metric || typeof metric !== "object") return undefined;
  const pct = (metric as { percentiles?: Record<string, string | number> })
    .percentiles;
  if (pct?.p75 == null) return undefined;
  const v = pct.p75;
  const n =
    typeof v === "number" ? v : Number.parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function cohortLabel(ff: CruxFormFactor): string {
  return ff === "PHONE" ? "phone" : "desktop";
}

function checksForMetrics(
  metrics: Record<string, { percentiles?: Record<string, string | number> }>,
  ff: CruxFormFactor,
): AuditCheck[] {
  const tag = cohortLabel(ff);
  const pretty = ff === "PHONE" ? "Mobile (phone)" : "Desktop";

  const checks: AuditCheck[] = [
    row(
      `crux_${tag}_data`,
      `Chrome UX Report — ${pretty}`,
      "pass",
      `${pretty} cohort: real-user experience data in the public CrUX dataset (p75 values below).`,
    ),
  ];

  const lcp = readP75(metrics.largest_contentful_paint);
  if (lcp != null && Number.isFinite(lcp)) {
    const r: CheckResult =
      lcp <= 2500 ? "pass" : lcp <= 4000 ? "warn" : "fail";
    checks.push(
      metricRow(
        `crux_${tag}_lcp_p75`,
        `CrUX LCP (p75) — ${pretty}`,
        r,
        joinExplanation(
          `${pretty}: real-user LCP p75 ≈ ${Math.round(lcp)} ms (targets: ≤2.5s pass, ≤4s warn).`,
          lcpSuggestions(r),
        ),
        { value: Math.round(lcp), unit: "ms" },
      ),
    );
  }

  const inp = readP75(metrics.interaction_to_next_paint);
  if (inp != null && Number.isFinite(inp)) {
    const r: CheckResult =
      inp <= 200 ? "pass" : inp <= 500 ? "warn" : "fail";
    checks.push(
      metricRow(
        `crux_${tag}_inp_p75`,
        `CrUX INP (p75) — ${pretty}`,
        r,
        joinExplanation(
          `${pretty}: real-user INP p75 ≈ ${Math.round(inp)} ms (targets: ≤200 ms pass, ≤500 ms warn).`,
          inpSuggestions(r),
        ),
        { value: Math.round(inp), unit: "ms" },
      ),
    );
  }

  const clsVal = readP75(metrics.cumulative_layout_shift);
  if (clsVal != null && Number.isFinite(clsVal)) {
    const r: CheckResult =
      clsVal <= 0.1 ? "pass" : clsVal <= 0.25 ? "warn" : "fail";
    checks.push(
      metricRow(
        `crux_${tag}_cls_p75`,
        `CrUX CLS (p75) — ${pretty}`,
        r,
        joinExplanation(
          `${pretty}: real-user CLS p75 ≈ ${clsVal.toFixed(3)} (targets: ≤0.1 pass, ≤0.25 warn).`,
          clsSuggestions(r),
        ),
        { value: clsVal, unit: "cls" },
      ),
    );
  }

  const fcp = readP75(metrics.first_contentful_paint);
  if (fcp != null && Number.isFinite(fcp)) {
    const r: CheckResult =
      fcp <= 1800 ? "pass" : fcp <= 3000 ? "warn" : "fail";
    checks.push(
      metricRow(
        `crux_${tag}_fcp_p75`,
        `CrUX FCP (p75) — ${pretty}`,
        r,
        joinExplanation(
          `${pretty}: real-user FCP p75 ≈ ${Math.round(fcp)} ms (rough guide: ≤1.8s pass, ≤3s warn).`,
          fcpSuggestions(r),
        ),
        { value: Math.round(fcp), unit: "ms" },
      ),
    );
  }

  return checks;
}

async function queryCruxCohort(
  originBase: string,
  apiKey: string,
  formFactor: CruxFormFactor,
): Promise<AuditCheck[]> {
  const url = `${CRUX_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ origin: originBase, formFactor }),
    signal: AbortSignal.timeout(CRUX_TIMEOUT_MS),
  });

  const data = (await res.json()) as {
    record?: {
      metrics?: Record<string, { percentiles?: Record<string, string | number> }>;
    };
    error?: { message?: string; status?: string };
  };

  const tag = cohortLabel(formFactor);
  const pretty = formFactor === "PHONE" ? "Mobile (phone)" : "Desktop";

  if (!res.ok) {
    const msg =
      data?.error?.message ??
      (res.status === 404
        ? `No public CrUX ${pretty} cohort for this origin (insufficient traffic or unknown origin).`
        : `CrUX API HTTP ${res.status} (${pretty}).`);
    return [
      row(
        `crux_${tag}_api`,
        `Chrome UX Report — ${pretty}`,
        "warn",
        msg,
      ),
    ];
  }

  if (!data.record) {
    return [
      row(
        `crux_${tag}_record`,
        `Chrome UX Report — ${pretty}`,
        "warn",
        `CrUX returned no ${pretty} record (traffic may be below the public dataset threshold).`,
      ),
    ];
  }

  const metrics = data.record.metrics;
  if (!metrics || Object.keys(metrics).length === 0) {
    return [
      row(
        `crux_${tag}_empty`,
        `Chrome UX Report — ${pretty}`,
        "warn",
        `CrUX returned no ${pretty} metric histograms (often low traffic or very new site).`,
      ),
    ];
  }

  return checksForMetrics(metrics, formFactor);
}

/**
 * Fetch origin-level Chrome UX Report (real-user) percentiles once per audit
 * for **phone** and **desktop** cohorts separately.
 */
export async function runCruxOriginChecks(originWebsiteUrl: string): Promise<AuditCheck[]> {
  const originBase = normalizeUrl(originWebsiteUrl);
  if (!originBase) return [];

  const apiKey =
    process.env.CRUX_API_KEY?.trim() ||
    process.env.PSI_API_KEY?.trim();
  if (!apiKey) return [];

  try {
    const [phoneChecks, desktopChecks] = await Promise.all([
      queryCruxCohort(originBase, apiKey, "PHONE"),
      queryCruxCohort(originBase, apiKey, "DESKTOP"),
    ]);
    return [...phoneChecks, ...desktopChecks];
  } catch {
    return [
      row(
        "crux_api",
        "Chrome UX Report (field data)",
        "warn",
        "CrUX request failed or timed out; enable Chrome UX Report API for your Google key or try again later.",
      ),
    ];
  }
}
