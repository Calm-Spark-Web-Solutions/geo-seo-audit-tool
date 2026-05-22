import { describe, expect, it } from "vitest";

import {
  buildSetupChecklistSteps,
  countRequiredDone,
  isSetupStepDone,
  patchSetupChecklistMeta,
  readSetupChecklist,
  shouldHideSetupChecklist,
  shouldShowReopenLink,
} from "./setup-checklist";

const EMPTY_MANUAL = {
  community: false,
  google: false,
  scan: false,
  team: false,
} as const;

describe("readSetupChecklist", () => {
  it("reads per-org manual flags and dismissed", () => {
    const meta = {
      setup_checklist: {
        org1: { google: true, dismissed: true },
      },
    };
    expect(readSetupChecklist(meta, "org1")).toEqual({
      manual: { community: false, google: true, scan: false, team: false },
      dismissed: true,
    });
    expect(readSetupChecklist(meta, "other")).toEqual({
      manual: EMPTY_MANUAL,
      dismissed: false,
    });
  });
});

describe("isSetupStepDone", () => {
  it("is true when auto or manual", () => {
    expect(isSetupStepDone(true, false)).toBe(true);
    expect(isSetupStepDone(false, true)).toBe(true);
    expect(isSetupStepDone(false, false)).toBe(false);
  });
});

describe("buildSetupChecklistSteps", () => {
  it("marks community and scan done from auto detection", () => {
    const steps = buildSetupChecklistSteps({
      hasCommunity: true,
      googleConnected: false,
      hasCompleteScan: false,
      manual: EMPTY_MANUAL,
    });
    expect(steps.find((s) => s.id === "community")?.done).toBe(true);
    expect(steps.find((s) => s.id === "scan")?.done).toBe(false);
  });

  it("counts only required steps for progress", () => {
    const steps = buildSetupChecklistSteps({
      hasCommunity: true,
      googleConnected: true,
      hasCompleteScan: true,
      manual: EMPTY_MANUAL,
    });
    // community + scan are required; google + team are optional
    expect(countRequiredDone(steps)).toEqual({ done: 2, total: 2 });
  });

  it("marks google as optional", () => {
    const steps = buildSetupChecklistSteps({
      hasCommunity: true,
      googleConnected: false,
      hasCompleteScan: true,
      manual: EMPTY_MANUAL,
    });
    expect(steps.find((s) => s.id === "google")?.optional).toBe(true);
  });

  it("marks derived steps with derived=true", () => {
    const steps = buildSetupChecklistSteps({
      hasCommunity: false,
      googleConnected: false,
      hasCompleteScan: false,
      manual: EMPTY_MANUAL,
    });
    expect(steps.find((s) => s.id === "community")?.derived).toBe(true);
    expect(steps.find((s) => s.id === "scan")?.derived).toBe(true);
    expect(steps.find((s) => s.id === "google")?.derived).toBe(true);
    expect(steps.find((s) => s.id === "team")?.derived).toBe(false);
  });
});

describe("shouldHideSetupChecklist", () => {
  it("hides when dismissed", () => {
    const steps = buildSetupChecklistSteps({
      hasCommunity: false,
      googleConnected: false,
      hasCompleteScan: false,
      manual: EMPTY_MANUAL,
    });
    expect(shouldHideSetupChecklist(true, steps)).toBe(true);
  });

  it("hides when required steps done", () => {
    const steps = buildSetupChecklistSteps({
      hasCommunity: true,
      googleConnected: true,
      hasCompleteScan: true,
      manual: EMPTY_MANUAL,
    });
    expect(shouldHideSetupChecklist(false, steps)).toBe(true);
  });

  it("does not hide when team optional incomplete only", () => {
    const steps = buildSetupChecklistSteps({
      hasCommunity: true,
      googleConnected: true,
      hasCompleteScan: true,
      manual: EMPTY_MANUAL,
    });
    expect(shouldHideSetupChecklist(false, steps)).toBe(true);
  });
});

describe("shouldShowReopenLink", () => {
  it("shows when dismissed but required incomplete", () => {
    const steps = buildSetupChecklistSteps({
      hasCommunity: false,
      googleConnected: false,
      hasCompleteScan: false,
      manual: EMPTY_MANUAL,
    });
    expect(shouldShowReopenLink(true, steps)).toBe(true);
    expect(shouldShowReopenLink(false, steps)).toBe(false);
  });
});

describe("patchSetupChecklistMeta", () => {
  it("merges org state without dropping other orgs", () => {
    const next = patchSetupChecklistMeta(
      { setup_checklist: { a: { google: true } } },
      "b",
      { scan: true },
    );
    expect(next.setup_checklist?.a?.google).toBe(true);
    expect(next.setup_checklist?.b?.scan).toBe(true);
  });
});
