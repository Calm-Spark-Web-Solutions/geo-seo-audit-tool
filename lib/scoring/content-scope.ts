import type { Cheerio, CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

/** Elements treated as site chrome, not primary page content. */
export const CHROME_SELECTORS =
  "header, footer, nav, [role='banner'], [role='contentinfo'], [role='navigation']";

const NON_CONTENT_SELECTORS = "script, style, noscript";

/**
 * Resolves the DOM subtree used for body-derived GEO/content checks.
 * Prefers <main>, then <article>, else <body> with chrome removed.
 */
export function resolveMainContent($: CheerioAPI): Cheerio<Element> {
  const main = $("main").first();
  if (main.length > 0) return main;

  const article = $("article").first();
  if (article.length > 0) return article;

  const clone = $("body").clone();
  clone.find(`${CHROME_SELECTORS}, ${NON_CONTENT_SELECTORS}`).remove();
  return clone;
}

/** Normalized visible text from a content scope (or any cheerio selection). */
export function contentText(scope: Cheerio<Element>): string {
  const clone = scope.clone();
  clone.find(NON_CONTENT_SELECTORS).remove();
  return clone.text().replace(/\s+/g, " ").trim();
}

/** Query within a content scope only. */
export function contentFind(
  scope: Cheerio<Element>,
  selector: string,
): Cheerio<Element> {
  return scope.find(selector);
}

/** True when the element sits inside header, footer, or nav chrome. */
export function isInChrome($: CheerioAPI, el: Element): boolean {
  return $(el).closest(CHROME_SELECTORS).length > 0;
}

/** True when `el` is the scope root or a descendant of it. */
export function isInsideContentScope(
  scope: Cheerio<Element>,
  el: Element,
): boolean {
  const root = scope.get(0);
  if (!root) return false;
  let cur: Element | null = el;
  while (cur) {
    if (cur === root) return true;
    cur = cur.parent as Element | null;
  }
  return false;
}
