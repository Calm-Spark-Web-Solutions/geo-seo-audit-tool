"use server";

import { revalidatePath } from "next/cache";

import {
  patchSetupChecklistMeta,
  type SetupChecklistStepId,
} from "@/lib/onboarding/setup-checklist";
import { createClient } from "@/lib/supabase/server";

export type SetupChecklistActionResult =
  | { ok: true }
  | { ok: false; error: string };

function isValidStep(step: string): step is SetupChecklistStepId {
  return (
    step === "community" ||
    step === "google" ||
    step === "scan" ||
    step === "team"
  );
}

export async function setSetupChecklistStep(
  orgId: string,
  step: string,
  done: boolean,
): Promise<SetupChecklistActionResult> {
  if (!orgId?.trim()) {
    return { ok: false, error: "Organization is required." };
  }
  if (!isValidStep(step)) {
    return { ok: false, error: "Invalid checklist step." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: member } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("company_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) {
    return { ok: false, error: "You do not have access to this organization." };
  }

  const nextMeta = patchSetupChecklistMeta(user.user_metadata, orgId, {
    [step]: done,
    dismissed: false,
  });

  const { error } = await supabase.auth.updateUser({ data: nextMeta });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function dismissSetupChecklist(
  orgId: string,
): Promise<SetupChecklistActionResult> {
  if (!orgId?.trim()) {
    return { ok: false, error: "Organization is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: member } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("company_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) {
    return { ok: false, error: "You do not have access to this organization." };
  }

  const nextMeta = patchSetupChecklistMeta(user.user_metadata, orgId, {
    dismissed: true,
  });

  const { error } = await supabase.auth.updateUser({ data: nextMeta });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function reopenSetupChecklist(
  orgId: string,
): Promise<SetupChecklistActionResult> {
  if (!orgId?.trim()) {
    return { ok: false, error: "Organization is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: member } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("company_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) {
    return { ok: false, error: "You do not have access to this organization." };
  }

  const nextMeta = patchSetupChecklistMeta(user.user_metadata, orgId, {
    dismissed: false,
  });

  const { error } = await supabase.auth.updateUser({ data: nextMeta });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}
