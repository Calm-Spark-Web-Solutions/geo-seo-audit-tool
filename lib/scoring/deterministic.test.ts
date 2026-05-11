import { describe, expect, it } from "vitest";

import type { AuditCheck, CheckResult } from "@/types";

import { runDeterministicChecks, scoreFromResult, resultFromScore } from "./deterministic";

function findCheck(
  result: { seoChecks: AuditCheck[]; geoChecks: AuditCheck[] },
  key: string,
): AuditCheck | undefined {
  return (
    result.seoChecks.find((c) => c.key === key) ??
    result.geoChecks.find((c) => c.key === key)
  );
}

function expectResult(
  result: { seoChecks: AuditCheck[]; geoChecks: AuditCheck[] },
  key: string,
  expected: CheckResult,
): void {
  const c = findCheck(result, key);
  if (!c) throw new Error(`Expected a check with key=${key}`);
  expect(c.result).toBe(expected);
}

const PAGE_URL = "https://example.com/services";

const GOOD_HTML = `<!doctype html>
<html lang="en-US">
  <head>
    <title>Sunset Senior Living — Assisted Living in Sunnyvale CA</title>
    <meta name="description" content="${"Sunset Senior Living offers compassionate assisted living, memory care, and respite stays in Sunnyvale California. Tour our community and meet our staff.".padEnd(150, " ")}">
    <link rel="canonical" href="https://example.com/services">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta property="og:title" content="Sunset Senior Living">
    <meta property="og:description" content="Compassionate assisted living and memory care.">
    <meta property="og:image" content="https://example.com/og.jpg">
    <meta name="twitter:card" content="summary_large_image">
    <script type="application/ld+json">{
      "@context":"https://schema.org",
      "@type":"LocalBusiness",
      "name":"Sunset Senior Living",
      "address":"123 Main St",
      "telephone":"555-1234"
    }</script>
  </head>
  <body>
    <main>
      <article>
        <h1>Compassionate Senior Care in Sunnyvale</h1>
        <h2>What is assisted living?</h2>
        <p>${"We provide assisted living, memory care, and respite stays for seniors in our community. Our trained staff is here twenty-four hours a day to help residents thrive. ".repeat(4)}</p>
        <h2>Frequently asked questions</h2>
        <h3>Is assisted living covered by Medicare?</h3>
        <p>${"Medicare does not directly cover assisted living, but many residents use long-term-care insurance, VA benefits, or private pay. Speak with our advisor for personalized guidance. ".repeat(3)}</p>
        <ul>
          <li>Private and shared rooms</li>
          <li>On-site dining</li>
          <li>Wellness programs</li>
        </ul>
        <ol>
          <li>Schedule a tour</li>
          <li>Meet the team</li>
          <li>Move in</li>
        </ol>
        <figure>
          <img src="/photo.webp" alt="Resident enjoying breakfast in the dining room">
          <figcaption>Breakfast at Sunset Senior Living.</figcaption>
        </figure>
        <p><a href="/about">About us</a> | <a href="/care">Care levels</a> | <a href="/tour">Schedule a tour</a> | <a href="/staff">Our team</a> | <a href="/blog">Resources</a></p>
      </article>
    </main>
  </body>
</html>`;

const MISSING_META_HTML = `<!doctype html>
<html>
  <head></head>
  <body>
    <p>tiny page with no metadata</p>
  </body>
</html>`;

const BAD_HEADINGS_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>Bad Headings Test Page Title For Coverage Purposes</title>
    <meta name="description" content="${"Bad headings page with no h1 only h2 elements to validate the heading checks fire as warn or fail in the deterministic scoring layer correctly here.".padEnd(150, " ")}">
  </head>
  <body>
    <h2>Section A</h2>
    <h2>Section B</h2>
    <h4>Skipped level (h2 to h4)</h4>
    <p>Body text without an h1.</p>
  </body>
</html>`;

describe("scoreFromResult / resultFromScore", () => {
  it("maps results to canonical numeric anchors", () => {
    expect(scoreFromResult("pass")).toBe(100);
    expect(scoreFromResult("warn")).toBe(50);
    expect(scoreFromResult("fail")).toBe(0);
  });

  it("inverts via thresholds at 80 and 50", () => {
    expect(resultFromScore(90)).toBe("pass");
    expect(resultFromScore(60)).toBe("warn");
    expect(resultFromScore(20)).toBe("fail");
  });
});

describe("runDeterministicChecks: well-formed page", () => {
  const result = runDeterministicChecks(GOOD_HTML, PAGE_URL);

  it("passes title length, h1, viewport, canonical, og, https", () => {
    expectResult(result, "title_length", "pass");
    expectResult(result, "h1_count", "pass");
    expectResult(result, "viewport", "pass");
    expectResult(result, "canonical", "pass");
    expectResult(result, "og_tags", "pass");
    expectResult(result, "https", "pass");
  });

  it("passes JSON-LD presence and a recognized @type", () => {
    expectResult(result, "json_ld", "pass");
    expectResult(result, "json_ld_syntax", "pass");
    expectResult(result, "structured_data_coverage", "pass");
    expectResult(result, "schema_organization_family", "pass");
  });

  it("passes the alt-text and FAQ-heading GEO checks", () => {
    expectResult(result, "img_alt", "pass");
    expectResult(result, "faq_heading", "pass");
    expectResult(result, "internal_links", "pass");
  });

  it("emits no high-priority fixes for the well-formed page", () => {
    const high = result.fixes.filter((f) => f.priority === "high");
    expect(high).toEqual([]);
  });
});

describe("runDeterministicChecks: missing metadata", () => {
  const result = runDeterministicChecks(MISSING_META_HTML, PAGE_URL);

  it("fails title, meta description, h1, canonical, viewport, json-ld", () => {
    expectResult(result, "title_length", "fail");
    expectResult(result, "meta_description", "fail");
    expectResult(result, "h1_count", "fail");
    expectResult(result, "canonical", "fail");
    expectResult(result, "viewport", "fail");
    expectResult(result, "json_ld", "fail");
  });

  it("fails the html_lang check when <html lang> is missing", () => {
    expectResult(result, "html_lang", "fail");
  });

  it("emits high-priority fixes for the failed checks", () => {
    const high = result.fixes.filter((f) => f.priority === "high");
    expect(high.length).toBeGreaterThan(3);
  });
});

describe("runDeterministicChecks: evidence shape", () => {
  const result = runDeterministicChecks(GOOD_HTML, PAGE_URL);

  it("attaches link evidence on internal_links with inspector hint", () => {
    const c = findCheck(result, "internal_links");
    expect(c).toBeDefined();
    expect(c?.evidence).toBeDefined();
    expect(c?.evidence?.inspector).toBe("links");
    expect((c?.evidence?.items.length ?? 0)).toBeGreaterThan(0);
    const first = c?.evidence?.items[0];
    expect(first?.type).toBe("link");
    if (first && first.type === "link") {
      expect(first.url.startsWith("http")).toBe(true);
    }
  });

  it("attaches schema evidence with the LocalBusiness type", () => {
    const c = findCheck(result, "structured_data_coverage");
    expect(c?.evidence?.inspector).toBe("schema");
    const types = (c?.evidence?.items ?? [])
      .filter((i) => i.type === "schema")
      .map((i) => (i.type === "schema" ? i.schemaType : ""));
    expect(types).toContain("LocalBusiness");
  });

  it("omits img_alt evidence when no images are missing alt text", () => {
    const c = findCheck(result, "img_alt");
    expect(c?.evidence).toBeUndefined();
  });

  it("captures missing-alt image evidence on a page with bare <img> tags", () => {
    const html = `<!doctype html>
<html lang="en">
  <head><title>Image Missing Alt Test Page Title Long Enough</title></head>
  <body>
    <main>
      <h1>Hero</h1>
      <p>Lead copy here describing the image below.</p>
      <img src="/hero.png">
      <img src="/banner.png" alt="">
    </main>
  </body>
</html>`;
    const r = runDeterministicChecks(html, PAGE_URL);
    const c = findCheck(r, "img_alt");
    expect(c?.result).toBe("fail");
    expect(c?.evidence?.inspector).toBe("images");
    const imgs = (c?.evidence?.items ?? []).filter((i) => i.type === "image");
    expect(imgs.length).toBe(2);
    expect(c?.evidence?.totalCount).toBe(2);
  });
});

describe("runDeterministicChecks: bad headings page", () => {
  const result = runDeterministicChecks(BAD_HEADINGS_HTML, PAGE_URL);

  it("fails the single-H1 rule", () => {
    expectResult(result, "h1_count", "fail");
  });

  it("warns on the heading outline when ranks skip (H2 -> H4)", () => {
    expectResult(result, "heading_outline", "warn");
  });

  it("still passes the title check (it is in the target band)", () => {
    expectResult(result, "title_length", "pass");
  });
});
