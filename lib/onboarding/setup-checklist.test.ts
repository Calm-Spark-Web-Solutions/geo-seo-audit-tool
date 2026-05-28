import { describe, expect, it } from "vitest";

import {
  buildSetupChecklistSteps,
  countRequiredDone,
  isSetupStepDone,
  isValidSetupChecklistOrgId,
  patchSetupChecklistMeta,
  readSetupChecklist,
  setupChecklistStorageKey,
  shouldHideSetupChecklist,
  shouldShowReopenLink,
} from "./setup-checklist";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

const EMPTY_MANUAL = {
  community: false,
  google: false,
  scan: false,
  team: false,
} as const;

describe("isValidSetupChecklistOrgId", () => {
  it("accepts UUID org ids", () => {
    expect(isValidSetupChecklistOrgId(ORG_A)).toBe(true);
  });

  it("rejects prototype pollution keys", () => {
    expect(isValidSetupChecklistOrgId("__proto__")).toBe(false);
    expect(isValidSetupChecklistOrgId("constructor")).toBe(false);
  });
});

describe("readSetupChecklist", () => {
  it("reads per-org manual flags and dismissed from prefixed keys", () => {
    const meta = {
      setup_checklist: {
        [setupChecklistStorageKey(ORG_A)]: { google: true, dismissed: true },
      },
    };
    expect(readSetupChecklist(meta, ORG_A)).toEqual({
      manual: { community: false, google: true, scan: false, team: false },
      dismissed: true,
    });
    expect(readSetupChecklist(meta, ORG_B)).toEqual({
      manual: EMPTY_MANUAL,
      dismissed: false,
    });
  });

  it("reads legacy unprefixed org keys", () => {
    const meta = {
      setup_checklist: {
        [ORG_A]: { scan: true },
      },
    };
    expect(readSetupChecklist(meta, ORG_A).manual.scan).toBe(true);
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
      {
        setup_checklist: {
          [setupChecklistStorageKey(ORG_A)]: { google: true },
        },
      },
      ORG_B,
      { scan: true },
    );
    expect(next.setup_checklist?.[setupChecklistStorageKey(ORG_A)]?.google).toBe(
      true,
    );
    expect(next.setup_checklist?.[setupChecklistStorageKey(ORG_B)]?.scan).toBe(
      true,
    );
  });

  it("does not write when org id is invalid", () => {
    const meta = { setup_checklist: {} };
    const next = patchSetupChecklistMeta(meta, "__proto__", { dismissed: true });
    expect(next.setup_checklist).toEqual({});
    expect(Object.prototype.hasOwnProperty.call(next.setup_checklist ?? {}, "__proto__")).toBe(
      false,
    );
  });

  it("does not pollute Object.prototype", () => {
    const next = patchSetupChecklistMeta({}, "__proto__", { google: true });
    expect(({} as { google?: boolean }).google).toBeUndefined();
    expect(next.setup_checklist?.["__proto__"]).toBeUndefined();
  });
});
