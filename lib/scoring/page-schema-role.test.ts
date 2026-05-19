import { describe, expect, it } from "vitest";

import type { AuditCheck } from "@/types";

import { hintsFromAuditChecks } from "./page-schema-hints";
import {
  evaluateSchemaFit,
  inferPageSchemaRole,
  inferPageSchemaRoleWithMeta,
  pageSchemaRoleLabel,
} from "./page-schema-role";

const SITE_A = "https://client-a.example";
const SITE_B = "https://client-b.test";
const LOCALBIZ = "https://localbiz.example";

describe("inferPageSchemaRole", () => {
  it("classifies homepage on any host", () => {
    expect(inferPageSchemaRole(`${SITE_A}/`)).toBe("homepage");
    expect(inferPageSchemaRole(`${SITE_B}/index.html`)).toBe("homepage");
  });

  it("classifies contact and directions on multiple hosts", () => {
    expect(inferPageSchemaRole(`${SITE_A}/contact`)).toBe("contact");
    expect(inferPageSchemaRole(`${LOCALBIZ}/schedule-a-tour`)).toBe("contact");
  });

  it("classifies campus-style slugs as facility not service", () => {
    expect(inferPageSchemaRole(`${SITE_A}/campus`)).toBe("facility");
    expect(inferPageSchemaRole(`${SITE_B}/our-campus/`)).toBe("facility");
    expect(inferPageSchemaRole(`${SITE_A}/community-life`)).toBe("facility");
  });

  it("classifies universal facilities and amenities paths", () => {
    expect(inferPageSchemaRole(`${LOCALBIZ}/facilities`)).toBe("facility");
    expect(inferPageSchemaRole(`${SITE_B}/amenities`)).toBe("facility");
  });

  it("classifies care-level and universal offering paths as service", () => {
    expect(inferPageSchemaRole(`${SITE_A}/health-services`)).toBe("service");
    expect(inferPageSchemaRole(`${SITE_B}/memory-care`)).toBe("service");
    expect(inferPageSchemaRole(`${LOCALBIZ}/assisted-living`)).toBe("service");
    expect(inferPageSchemaRole(`${LOCALBIZ}/services`)).toBe("service");
    expect(inferPageSchemaRole(`${LOCALBIZ}/products`)).toBe("service");
  });

  it("classifies blog paths on any host", () => {
    expect(inferPageSchemaRole(`${SITE_A}/blog/some-post`)).toBe("blog");
    expect(inferPageSchemaRole(`${SITE_B}/news/article`)).toBe("blog");
  });

  it("classifies listing hubs", () => {
    expect(inferPageSchemaRole(`${SITE_A}/floor-plans`)).toBe("listing");
    expect(inferPageSchemaRole(`${LOCALBIZ}/jobs`)).toBe("listing");
  });

  it("uses title hints when path is ambiguous", () => {
    expect(
      inferPageSchemaRole(`${SITE_A}/page-123`, { title: "Contact Us | Acme Community" }),
    ).toBe("contact");
    expect(
      inferPageSchemaRole(`${SITE_B}/info`, { h1: "Frequently Asked Questions" }),
    ).toBe("faq");
  });
});

describe("inferPageSchemaRoleWithMeta", () => {
  it("prefers BlogPosting on unknown path", () => {
    const meta = inferPageSchemaRoleWithMeta({
      pageUrl: `${LOCALBIZ}/p/123`,
      detectedTypes: ["BlogPosting", "WebPage"],
    });
    expect(meta.role).toBe("blog");
    expect(meta.confidence).toBe("high");
    expect(meta.reason).toContain("BlogPosting");
  });

  it("returns generic with low confidence when no signals", () => {
    const meta = inferPageSchemaRoleWithMeta({
      pageUrl: `${SITE_A}/x9z-random-slug`,
    });
    expect(meta.role).toBe("generic");
    expect(meta.confidence).toBe("low");
  });

  it("classifies campus slug as facility with medium confidence", () => {
    const meta = inferPageSchemaRoleWithMeta({
      pageUrl: `${SITE_B}/our-campus/`,
    });
    expect(meta.role).toBe("facility");
    expect(meta.confidence).toBe("medium");
  });
});

describe("evaluateSchemaFit", () => {
  it("marks local entity present for Organization on homepage", () => {
    const rows = evaluateSchemaFit("homepage", ["Organization", "WebSite"]);
    expect(rows.find((r) => r.key === "local_entity")?.status).toBe("present");
    expect(rows.find((r) => r.key === "website")?.status).toBe("present");
  });

  it("facility role does not require Service", () => {
    const rows = evaluateSchemaFit("facility", ["WebPage", "Organization", "Place"]);
    const service = rows.find((r) => r.key === "service");
    expect(service?.priority).toBe("optional");
    const required = rows.filter((r) => r.priority === "required");
    expect(required.some((r) => r.key === "service")).toBe(false);
    expect(rows.find((r) => r.key === "webpage")?.status).toBe("present");
    expect(rows.find((r) => r.key === "place")?.status).toBe("present");
  });

  it("treats Service or ProfessionalService as service recommendation", () => {
    const rows = evaluateSchemaFit("service", ["ProfessionalService", "WebPage"]);
    expect(rows.find((r) => r.key === "service")?.status).toBe("present");
  });

  it("expects ContactPage on contact role", () => {
    const rows = evaluateSchemaFit("contact", ["LocalBusiness"]);
    expect(rows.find((r) => r.key === "contact_page")?.status).toBe("missing");
  });

  it("exposes neutral role labels", () => {
    expect(pageSchemaRoleLabel("facility")).toBe("Facilities / amenities");
    expect(pageSchemaRoleLabel("service")).toBe("Service / offering page");
  });
});

describe("hintsFromAuditChecks", () => {
  it("parses H1 text from h1_count explanation", () => {
    const checks: AuditCheck[] = [
      {
        key: "h1_count",
        label: "Single H1",
        result: "pass",
        explanation: 'Exactly one H1. H1 text: "Campus Map".',
        score: 100,
      },
    ];
    expect(hintsFromAuditChecks(checks).h1).toBe("Campus Map");
  });
});
