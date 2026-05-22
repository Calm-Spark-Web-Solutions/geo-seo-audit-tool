/** Per-organization getting-started checklist stored in Supabase user_metadata. */

export const SETUP_CHECKLIST_STEP_IDS = [
  "community",
  "scan",
  "google",
  "team",
] as const;

export type SetupChecklistStepId = (typeof SETUP_CHECKLIST_STEP_IDS)[number];

export type SetupChecklistOrgState = {
  community?: boolean;
  google?: boolean;
  scan?: boolean;
  team?: boolean;
  dismissed?: boolean;
};

export type SetupChecklistMeta = {
  setup_checklist?: Record<string, SetupChecklistOrgState>;
};

export type SetupChecklistManualProgress = {
  community: boolean;
  google: boolean;
  scan: boolean;
  team: boolean;
};

export type SetupChecklistReadResult = {
  manual: SetupChecklistManualProgress;
  dismissed: boolean;
};

export function readSetupChecklist(
  meta: unknown,
  orgId: string,
): SetupChecklistReadResult {
  const root = (meta ?? {}) as SetupChecklistMeta;
  const org = root.setup_checklist?.[orgId];
  return {
    manual: {
      community: org?.community === true,
      google: org?.google === true,
      scan: org?.scan === true,
      team: org?.team === true,
    },
    dismissed: org?.dismissed === true,
  };
}

/** Step is complete when the product detected it or the user checked it off. */
export function isSetupStepDone(autoDone: boolean, manualDone: boolean): boolean {
  return autoDone || manualDone;
}

export type SetupChecklistStepView = {
  id: SetupChecklistStepId;
  autoDone: boolean;
  manualDone: boolean;
  done: boolean;
  optional: boolean;
  /** True when `done` is derived from data; manual check-off should be disabled. */
  derived: boolean;
};

export function buildSetupChecklistSteps(input: {
  hasCommunity: boolean;
  googleConnected: boolean;
  hasCompleteScan: boolean;
  manual: SetupChecklistManualProgress;
}): SetupChecklistStepView[] {
  return [
    {
      id: "community",
      autoDone: input.hasCommunity,
      manualDone: false,
      done: input.hasCommunity,
      optional: false,
      derived: true,
    },
    {
      id: "scan",
      autoDone: input.hasCompleteScan,
      manualDone: input.manual.scan,
      done: isSetupStepDone(input.hasCompleteScan, input.manual.scan),
      optional: false,
      derived: true,
    },
    {
      id: "google",
      autoDone: input.googleConnected,
      manualDone: input.manual.google,
      done: isSetupStepDone(input.googleConnected, input.manual.google),
      optional: true,
      derived: true,
    },
    {
      id: "team",
      autoDone: false,
      manualDone: input.manual.team,
      done: input.manual.team,
      optional: true,
      derived: false,
    },
  ];
}

/** Required steps only (google + scan) for progress and auto-hide. */
export function requiredSetupSteps(steps: SetupChecklistStepView[]): SetupChecklistStepView[] {
  return steps.filter((s) => !s.optional);
}

export function countRequiredDone(steps: SetupChecklistStepView[]): {
  done: number;
  total: number;
} {
  const required = requiredSetupSteps(steps);
  return {
    done: required.filter((s) => s.done).length,
    total: required.length,
  };
}

export function shouldHideSetupChecklist(
  dismissed: boolean,
  steps: SetupChecklistStepView[],
): boolean {
  if (dismissed) return true;
  const { done, total } = countRequiredDone(steps);
  return total > 0 && done >= total;
}

export function shouldShowReopenLink(
  dismissed: boolean,
  steps: SetupChecklistStepView[],
): boolean {
  if (!dismissed) return false;
  const { done, total } = countRequiredDone(steps);
  return done < total;
}

export function patchSetupChecklistMeta(
  meta: unknown,
  orgId: string,
  patch: Partial<SetupChecklistOrgState>,
): SetupChecklistMeta {
  const root = { ...((meta ?? {}) as SetupChecklistMeta) };
  const map = { ...(root.setup_checklist ?? {}) };
  map[orgId] = { ...map[orgId], ...patch };
  root.setup_checklist = map;
  return root;
}
