import { describe, expect, it } from "vitest";

import {
  DEFAULT_MONTHLY_REPORT_SETTINGS,
  normalizeSettingsRow,
  parseAdditionalRecipients,
} from "./monthly-report-settings";

describe("parseAdditionalRecipients", () => {
  it("parses comma-separated emails with dedupe and max 10", () => {
    const many = Array.from({ length: 12 }, (_, i) => `user${i}@example.com`).join(
      ", ",
    );
    const parsed = parseAdditionalRecipients(many);
    expect(parsed).toHaveLength(10);
    expect(parsed[0]).toBe("user0@example.com");
  });

  it("drops invalid addresses", () => {
    expect(parseAdditionalRecipients("good@x.com, bad, GOOD@x.com")).toEqual([
      "good@x.com",
    ]);
  });
});

describe("normalizeSettingsRow", () => {
  it("returns defaults when row missing", () => {
    expect(normalizeSettingsRow("co-1", null)).toEqual(
      DEFAULT_MONTHLY_REPORT_SETTINGS("co-1"),
    );
  });

  it("merges partial row", () => {
    expect(
      normalizeSettingsRow("co-1", {
        enabled: false,
        additional_recipients: ["extra@example.com"],
      }),
    ).toMatchObject({
      enabled: false,
      include_owner_emails: true,
      additional_recipients: ["extra@example.com"],
    });
  });
});
