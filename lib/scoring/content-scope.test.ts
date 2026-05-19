import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";

import {
  CHROME_SELECTORS,
  contentFind,
  contentText,
  isInChrome,
  isInsideContentScope,
  resolveMainContent,
} from "./content-scope";

describe("resolveMainContent", () => {
  it("prefers main over article and body chrome", () => {
    const $ = cheerio.load(`<body>
      <header><p>Nav chrome</p></header>
      <main><p>Inside main landmark</p></main>
      <article><p>Should not win</p></article>
      <footer><p>Footer chrome</p></footer>
    </body>`);
    const scope = resolveMainContent($);
    expect(contentText(scope)).toBe("Inside main landmark");
  });

  it("uses article when main is absent", () => {
    const $ = cheerio.load(`<body>
      <nav><a href="/">Home</a></nav>
      <article><h1>Post</h1><p>Article body copy</p></article>
      <footer>Footer text</footer>
    </body>`);
    const scope = resolveMainContent($);
    expect(contentText(scope)).toContain("Article body copy");
    expect(contentText(scope)).not.toContain("Footer text");
  });

  it("strips chrome from body when no main or article", () => {
    const $ = cheerio.load(`<body>
      <header><h2>Site title</h2></header>
      <div><p>Primary copy without landmarks</p></div>
      <footer><h2>Footer FAQ?</h2></footer>
    </body>`);
    const scope = resolveMainContent($);
    expect(contentText(scope)).toContain("Primary copy without landmarks");
    expect(contentFind(scope, "h2").text()).not.toContain("Footer FAQ");
  });
});

describe("isInsideContentScope", () => {
  it("returns true for descendants of the scope root", () => {
    const $ = cheerio.load(`<body><main><p><a id="in" href="/x">Go</a></p></main></body>`);
    const scope = resolveMainContent($);
    const link = $("#in")[0]!;
    expect(isInsideContentScope(scope, link)).toBe(true);
  });

  it("returns false for links outside main", () => {
    const $ = cheerio.load(`<body><main><p>Hi</p></main><footer><a id="out" href="/x">Out</a></footer></body>`);
    const scope = resolveMainContent($);
    const link = $("#out")[0]!;
    expect(isInsideContentScope(scope, link)).toBe(false);
  });
});

describe("isInChrome", () => {
  it("detects links inside nav/header/footer", () => {
    const $ = cheerio.load(`<body>
      <nav><a id="nav" href="/">Home</a></nav>
      <main><a id="main" href="/about">About</a></main>
    </body>`);
    const navLink = $("#nav")[0]!;
    const mainLink = $("#main")[0]!;
    expect(isInChrome($, navLink)).toBe(true);
    expect(isInChrome($, mainLink)).toBe(false);
  });

  it("exports chrome selectors including ARIA roles", () => {
    expect(CHROME_SELECTORS).toContain("role='banner'");
  });
});
