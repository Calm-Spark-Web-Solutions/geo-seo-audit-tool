/** Per-organization getting-started checklist stored in Supabase user_metadata. */

const SETUP_CHECKLIST_ORG_KEY_PREFIX = "$";

const ORG_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BLOCKED_ORG_IDS = new Set(["__proto__", "constructor", "prototype"]);

/** Safe map key for `setup_checklist` — prefixed so user input cannot target built-in properties. */
export function setupChecklistStorageKey(orgId: string): string {
  return `${SETUP_CHECKLIST_ORG_KEY_PREFIX}${orgId.trim()}`;
}

export function isValidSetupChecklistOrgId(orgId: string): boolean {
  const trimmed = orgId.trim();
  if (!trimmed || BLOCKED_ORG_IDS.has(trimmed)) return false;
  return ORG_ID_UUID_RE.test(trimmed);
}

type SetupChecklistOrgMap = Map<string, SetupChecklistOrgState>;

function setupChecklistMapFromRecord(
  record: Record<string, SetupChecklistOrgState> | undefined,
): SetupChecklistOrgMap {
  const map: SetupChecklistOrgMap = new Map();
  if (!record) return map;
  for (const key of Object.keys(record)) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const value = record[key];
    if (value !== undefined) map.set(key, value);
  }
  return map;
}

function setupChecklistRecordFromMap(
  map: SetupChecklistOrgMap,
): Record<string, SetupChecklistOrgState> {
  return Object.fromEntries(map);
}

function readOrgStateFromMap(
  map: SetupChecklistOrgMap,
  orgId: string,
): SetupChecklistOrgState | undefined {
  const storageKey = setupChecklistStorageKey(orgId);
  return map.get(storageKey) ?? map.get(orgId);
}

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
  const orgMap = setupChecklistMapFromRecord(root.setup_checklist);
  const org = readOrgStateFromMap(orgMap, orgId);
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
  if (!isValidSetupChecklistOrgId(orgId)) {
    return root;
  }

  const storageKey = setupChecklistStorageKey(orgId);
  const orgMap = setupChecklistMapFromRecord(root.setup_checklist);
  const existing = {
    ...orgMap.get(orgId),
    ...orgMap.get(storageKey),
  };
  orgMap.set(storageKey, { ...existing, ...patch });
  root.setup_checklist = setupChecklistRecordFromMap(orgMap);
  return root;
}
