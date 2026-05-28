import { describe, expect, it } from "vitest";

import { buildMonthlyReportRecipientList } from "./monthly-report-recipients";
import { DEFAULT_MONTHLY_REPORT_SETTINGS } from "./monthly-report-settings";

describe("buildMonthlyReportRecipientList", () => {
  const companyId = "co-1";
  const base = DEFAULT_MONTHLY_REPORT_SETTINGS(companyId);

  it("returns empty when disabled", () => {
    expect(
      buildMonthlyReportRecipientList({
        settings: { ...base, enabled: false },
        memberEmails: ["owner@example.com"],
        contactEmail: "contact@example.com",
      }),
    ).toEqual([]);
  });

  it("includes members, contact, and additional with dedupe", () => {
    expect(
      buildMonthlyReportRecipientList({
        settings: {
          ...base,
          additional_recipients: ["OPS@example.com"],
        },
        memberEmails: ["admin@example.com", "admin@example.com"],
        contactEmail: "ops@example.com",
      }),
    ).toEqual(["admin@example.com", "ops@example.com"]);
  });

  it("omits contact when include_contact_email is false", () => {
    expect(
      buildMonthlyReportRecipientList({
        settings: { ...base, include_contact_email: false },
        memberEmails: ["owner@example.com"],
        contactEmail: "contact@example.com",
      }),
    ).toEqual(["owner@example.com"]);
  });
});
