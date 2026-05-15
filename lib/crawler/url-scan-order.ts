/**
 * Reorder discovered crawl/sitemap URLs so boilerplate legal / accessibility
 * pages tend to be scored last. Stable partition: preserves relative order
 * within primary vs secondary buckets.
 */

function matchesLegalSegment(seg: string): boolean {
  const tests = [
    /^terms(-|$|_)/,
    /terms-and-conditions/,
    /terms-of-service/,
    /terms-of-use/,
    /^privacy(-|$|_)/,
    /privacy-policy/,
    /^legal(-|$)/,
    /^accessibil/i,
    /web-accessibility/,
    /^disclaimer/,
    /^cookie(s)?(-|$)/,
    /cookie-policy/,
    /^gdpr/,
    /^hipaa/,
    /^notice(-|$)/,
    /^eho(-|$)/,
    /fair-housing/,
    /equal-housing/,
    /^ethics(-|$)/,
  ];
  return tests.some((re) => re.test(seg));
}

function isSecondaryLegalUrl(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    return false;
  }
  const segments = pathname.split("/").filter(Boolean);
  for (const seg of segments) {
    if (matchesLegalSegment(seg)) return true;
  }
  return false;
}

/** Primary URLs first, legal/boilerplate last; stable within each group. */
export function sortLegalUrlsLast(urls: string[]): string[] {
  const primary: string[] = [];
  const secondary: string[] = [];
  for (const u of urls) {
    if (isSecondaryLegalUrl(u)) secondary.push(u);
    else primary.push(u);
  }
  return [...primary, ...secondary];
}
