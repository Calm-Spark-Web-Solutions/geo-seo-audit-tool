import { describe, expect, it } from "vitest";

import {
  buildMonthlyGoogleReportHtml,
  buildMonthlyGoogleReportSubject,
  dedupeReportRecipients,
} from "./monthly-google-report";
import {
  formatReportMonthLabel,
  utcMonthStart,
} from "@/lib/integrations/google/monthly-report";

describe("dedupeReportRecipients", () => {
  it("dedupes case-insensitively and drops invalid", () => {
    expect(
      dedupeReportRecipients([
        "Admin@Example.com",
        "admin@example.com",
        "bad",
        " ops@example.com ",
      ]),
    ).toEqual(["admin@example.com", "ops@example.com"]);
  });
});

describe("buildMonthlyGoogleReportHtml", () => {
  it("includes community metrics and scan note", () => {
    const html = buildMonthlyGoogleReportHtml({
      companyName: "YoloCare",
      reportMonthLabel: "May 2026",
      siteUrl: "https://app.example.com",
      communities: [
        {
          communityId: "c1",
          name: "InyoCare",
          websiteUrl: "https://inyocare.com",
          gscClicks: 10,
          gscImpressions: 100,
          ga4Sessions: 5,
          ga4ActiveUsers: 3,
          latestScanScore: 72,
          scanQueued: true,
          metricsWarnings: [],
        },
      ],
    });
    expect(html).toContain("InyoCare");
    expect(html).toContain("10");
    expect(html).toContain("Monthly visibility scan queued");
    expect(html).toContain("/communities/c1");
  });
});

describe("buildMonthlyGoogleReportSubject", () => {
  it("includes company and month", () => {
    expect(buildMonthlyGoogleReportSubject("YoloCare", "May 2026")).toContain(
      "YoloCare",
    );
  });
});

describe("utcMonthStart", () => {
  it("returns first of month in UTC", () => {
    expect(utcMonthStart(new Date("2026-05-15T12:00:00.000Z"))).toBe(
      "2026-05-01",
    );
  });
});

describe("formatReportMonthLabel", () => {
  it("formats month label", () => {
    expect(formatReportMonthLabel("2026-05-01")).toContain("2026");
  });
});
