import { describe, expect, it } from "vitest";

import {
  buildAnalyticsSiteWideChecks,
  detectAnalyticsTagsInHtml,
} from "./analytics-tags";

describe("detectAnalyticsTagsInHtml", () => {
  it("detects GA4 measurement ID in gtag config", () => {
    const html = `
      <script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ"></script>
      <script>gtag('config', 'G-ABC123XYZ');</script>
    `;
    const det = detectAnalyticsTagsInHtml(html);
    expect(det.hasGa4).toBe(true);
    expect(det.measurementIds).toContain("G-ABC123XYZ");
  });

  it("detects GTM container", () => {
    const html = `<script src="https://www.googletagmanager.com/gtm.js?id=GTM-XXXX"></script>`;
    const det = detectAnalyticsTagsInHtml(html);
    expect(det.hasGtm).toBe(true);
  });
});

describe("buildAnalyticsSiteWideChecks", () => {
  it("warns when only some pages have GA4", () => {
    const checks = buildAnalyticsSiteWideChecks([
      { url: "https://a.com/", html: "G-TEST123456" },
      { url: "https://a.com/b", html: "<html></html>" },
    ]);
    const ga4 = checks.find((c) => c.key === "ga4_measurement_id");
    expect(ga4?.result).toBe("warn");
  });
});
