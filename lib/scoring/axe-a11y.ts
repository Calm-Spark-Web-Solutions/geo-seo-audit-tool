import axe from "axe-core";
import type { DOMWindow } from "jsdom";
import { JSDOM } from "jsdom";

import type { AuditCheck, CheckResult } from "@/types";

import { scoreFromResult } from "./deterministic";

const DEFAULT_AXE_TIMEOUT_MS = 25_000;
const MIN_AXE_TIMEOUT_MS = 3_000;
const MAX_AXE_TIMEOUT_MS = 120_000;

function axeTimeoutMs(): number {
  const raw = process.env.AUDIT_RUN_AXE_TIMEOUT_MS?.trim() ?? "";
  const v = Number.parseInt(raw, 10);
  if (Number.isFinite(v) && v >= MIN_AXE_TIMEOUT_MS && v <= MAX_AXE_TIMEOUT_MS) {
    return v;
  }
  return DEFAULT_AXE_TIMEOUT_MS;
}

function isAxeEnabled(): boolean {
  const v = process.env.AUDIT_RUN_AXE?.trim().toLowerCase();
  return v === "1" || v === "true";
}

/** Minimal browser shims so axe-core does not throw or spin in Node/jsdom. */
function patchWindowForAxe(win: DOMWindow): void {
  const w = win as DOMWindow & {
    requestAnimationFrame?: (cb: FrameRequestCallback) => number;
    cancelAnimationFrame?: (id: number) => void;
    matchMedia?: (query: string) => MediaQueryList;
  };

  if (typeof w.requestAnimationFrame !== "function") {
    w.requestAnimationFrame = (cb: FrameRequestCallback) =>
      w.setTimeout(() => {
        cb(w.performance.now());
      }, 16) as unknown as number;
  }
  if (typeof w.cancelAnimationFrame !== "function") {
    w.cancelAnimationFrame = (id: number) => {
      w.clearTimeout(id);
    };
  }

  if (typeof w.matchMedia !== "function") {
    w.matchMedia = (query: string): MediaQueryList =>
      ({
        media: query,
        matches: false,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }

  const heProto = win.HTMLElement.prototype as unknown as {
    scrollIntoView?: (this: HTMLElement) => void;
  };
  if (typeof heProto.scrollIntoView !== "function") {
    heProto.scrollIntoView = function () {
      /* no-op — jsdom has no layout */
    };
  }
}

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
    category: "Accessibility (axe-core)",
    pillar: "GEO",
  };
}

function failureExplanation(err: unknown, timedOut: boolean): string {
  const base =
    "axe-core could not finish a WCAG scan in jsdom (Node has no full browser APIs). ";
  const tail =
    "Use Lighthouse or the browser DevTools Accessibility panel for authoritative results, or run audits with AUDIT_RUN_AXE off.";
  const timeoutHint = timedOut
    ? `Timed out after ${axeTimeoutMs()}ms — try AUDIT_RUN_AXE_TIMEOUT_MS (3000–120000). `
    : "";
  let suffix = "";
  if (process.env.AUDIT_RUN_AXE_DEBUG === "1") {
    const msg = err instanceof Error ? err.message : String(err);
    suffix = ` Detail: ${msg}`;
  }
  return `${base}${timeoutHint}${tail}${suffix}`;
}

/**
 * WCAG-focused automated checks via axe-core in jsdom (Node).
 * Disabled unless AUDIT_RUN_AXE=1|true due to latency.
 */
export async function runAxeChecks(
  html: string,
  pageUrl: string,
): Promise<AuditCheck[]> {
  if (!isAxeEnabled()) return [];

  const timeoutMs = axeTimeoutMs();
  let dom: JSDOM | null = null;
  let timedOut = false;

  try {
    dom = new JSDOM(html, {
      url: pageUrl || "http://localhost/",
      runScripts: undefined,
      resources: undefined,
      pretendToBeVisual: true,
    });
    const { window } = dom;
    patchWindowForAxe(window);

    const axeRun = axe.run(window.document, {
      resultTypes: ["violations"],
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
      /** Avoid iframe recursion and preload fetches — common hang sources in jsdom */
      iframes: false,
      preload: false,
    });

    const results = await Promise.race([
      axeRun,
      new Promise<never>((_, rej) =>
        setTimeout(() => {
          timedOut = true;
          rej(new Error("axe timeout"));
        }, timeoutMs),
      ),
    ]);

    const violations = results.violations ?? [];
    if (violations.length === 0) {
      return [
        row(
          "axe_wcag",
          "WCAG scans (axe-core)",
          "pass",
          "No WCAG 2 A/AA violations surfaced by axe-core in this DOM snapshot.",
        ),
      ];
    }

    let critical = 0;
    let serious = 0;
    let moderate = 0;
    for (const v of violations) {
      const imp = v.impact ?? "";
      if (imp === "critical") critical += 1;
      else if (imp === "serious") serious += 1;
      else if (imp === "moderate") moderate += 1;
    }

    const top = violations.slice(0, 4).map(
      (v) => `[${v.impact}] ${v.id}: ${v.help}`,
    );

    let result: CheckResult = "pass";
    if (critical > 0) result = "fail";
    else if (serious > 0 || moderate >= 5) result = "fail";
    else if (moderate > 0 || violations.length >= 3) result = "warn";

    const summary =
      violations.length <= 12
        ? ""
        : ` (${violations.length} violations; summaries truncated)`;

    return [
      row(
        "axe_wcag",
        "WCAG scans (axe-core)",
        result,
        `${violations.length} violation groups (critical=${critical}, serious=${serious}, moderate=${moderate}). ${top.join("; ")}${summary}`,
      ),
    ];
  } catch (e) {
    if (process.env.AUDIT_RUN_AXE_DEBUG === "1") {
      console.warn("[axe-a11y]", e);
    }
    return [
      row(
        "axe_run",
        "Accessibility (axe-core)",
        "warn",
        failureExplanation(e, timedOut),
      ),
    ];
  } finally {
    try {
      dom?.window.close();
    } catch {
      /* ignore close errors */
    }
  }
}
