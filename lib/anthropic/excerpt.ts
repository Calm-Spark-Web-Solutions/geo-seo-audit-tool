import * as cheerio from "cheerio";

/**
 * Plain-text excerpt for LLM context (no raw HTML).
 */
export function textExcerptFromHtml(html: string, maxChars = 4000): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();
  const text = $("body").length ? $("body").text() : $.root().text();
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, maxChars);
}
