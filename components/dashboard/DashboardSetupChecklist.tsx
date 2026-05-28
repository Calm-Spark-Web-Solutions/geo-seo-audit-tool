"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";

import {
  dismissSetupChecklist,
  reopenSetupChecklist,
  setSetupChecklistStep,
} from "@/app/(dashboard)/dashboard/setup-checklist-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildSetupChecklistSteps,
  countRequiredDone,
  shouldHideSetupChecklist,
  shouldShowReopenLink,
  type SetupChecklistManualProgress,
  type SetupChecklistStepId,
} from "@/lib/onboarding/setup-checklist";
import { cn } from "@/lib/utils";

const STEP_COPY: Record<
  SetupChecklistStepId,
  { label: string; helper: string; cta: string; href: (ctx: Ctx) => string }
> = {
  community: {
    label: "Add your first community",
    helper:
      "A community is one website you want to track. You can add more later.",
    cta: "Add community",
    href: (ctx) => `/companies/${encodeURIComponent(ctx.orgId)}/new-community`,
  },
  scan: {
    label: "Run your first visibility scan",
    helper:
      "Scores how your community website appears in Google and AI assistants.",
    cta: "Run scan",
    href: (ctx) =>
      ctx.firstCommunityId
        ? `/communities/${ctx.firstCommunityId}/new-visibility-scan`
        : `/companies/${ctx.orgId}/new-community`,
  },
  google: {
    label: "Connect Google (optional)",
    helper:
      "Adds real Search Console and Analytics traffic to your community pages. You can do this anytime.",
    cta: "Connect Google",
    href: (ctx) =>
      `/integrations/google?org=${encodeURIComponent(ctx.orgId)}`,
  },
  team: {
    label: "Invite a teammate",
    helper: "Invite marketing or agency teammates to help manage communities.",
    cta: "Invite team",
    href: () => "/settings?tab=team",
  },
};

type Ctx = { orgId: string; firstCommunityId: string | null };

export function DashboardSetupChecklist({
  orgId,
  hasCommunity,
  googleConnected,
  hasCompleteScan,
  firstCommunityId,
  initialManual,
  initialDismissed,
}: {
  orgId: string;
  hasCommunity: boolean;
  googleConnected: boolean;
  hasCompleteScan: boolean;
  firstCommunityId: string | null;
  initialManual: SetupChecklistManualProgress;
  initialDismissed: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [manual, setManual] = useState(initialManual);
  const [dismissed, setDismissed] = useState(initialDismissed);
  const [pendingStep, setPendingStep] = useState<SetupChecklistStepId | null>(
    null,
  );

  const serverProgressKey = `${initialDismissed}:${initialManual.community}:${initialManual.google}:${initialManual.scan}:${initialManual.team}`;
  const [syncedProgressKey, setSyncedProgressKey] = useState(serverProgressKey);
  if (serverProgressKey !== syncedProgressKey) {
    setSyncedProgressKey(serverProgressKey);
    setManual(initialManual);
    setDismissed(initialDismissed);
  }

  const ctx: Ctx = { orgId, firstCommunityId };
  const steps = buildSetupChecklistSteps({
    hasCommunity,
    googleConnected,
    hasCompleteScan,
    manual,
  });
  const { done: requiredDone, total: requiredTotal } = countRequiredDone(steps);
  const progressPct =
    requiredTotal > 0 ? Math.round((requiredDone / requiredTotal) * 100) : 0;

  const hidden = shouldHideSetupChecklist(dismissed, steps);
  const showReopen = shouldShowReopenLink(dismissed, steps);

  function runAction(
    action: () => Promise<{ ok: boolean; error?: string }>,
    opts?: { onError?: () => void },
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setPendingStep(null);
        router.refresh();
      } else {
        opts?.onError?.();
        toast.error(result.error ?? "Something went wrong.");
        setPendingStep(null);
      }
    });
  }

  function toggleStep(stepId: SetupChecklistStepId, currentlyDone: boolean) {
    const nextDone = !currentlyDone;
    setPendingStep(stepId);
    const previousManual = manual[stepId];
    setManual((prev) => ({ ...prev, [stepId]: nextDone }));
    runAction(() => setSetupChecklistStep(orgId, stepId, nextDone), {
      onError: () =>
        setManual((prev) => ({ ...prev, [stepId]: previousManual })),
    });
  }

  function handleDismiss() {
    setDismissed(true);
    runAction(() => dismissSetupChecklist(orgId), {
      onError: () => setDismissed(false),
    });
  }

  function handleReopen() {
    setDismissed(false);
    runAction(() => reopenSetupChecklist(orgId), {
      onError: () => setDismissed(true),
    });
  }

  if (showReopen) {
    return (
      <p className="text-sm text-muted-foreground">
        <button
          type="button"
          onClick={handleReopen}
          disabled={pending}
          className="font-medium text-foreground underline underline-offset-4 hover:no-underline disabled:opacity-50"
        >
          Show getting started checklist
        </button>
      </p>
    );
  }

  if (hidden) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Getting started</CardTitle>
            <button
              type="button"
              onClick={handleDismiss}
              disabled={pending}
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
            >
              Hide checklist
            </button>
          </div>
          <CardDescription>
            Complete these steps to get the most from Ranklume for your
            communities.
          </CardDescription>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {requiredDone} of {requiredTotal} complete
            </p>
            <div
              className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={requiredDone}
              aria-valuemin={0}
              aria-valuemax={requiredTotal}
              aria-label="Required setup steps completed"
            >
              <div
                className="h-full bg-foreground/80 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {steps.map((step) => {
            const copy = STEP_COPY[step.id];
            const href = copy.href(ctx);
            const isPending = pendingStep === step.id && pending;

            return (
              <li
                key={step.id}
                className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-2">
                  {step.derived ? (
                    <span
                      className={cn(
                        "mt-0.5 shrink-0",
                        isPending && "opacity-50",
                      )}
                      title={
                        step.done
                          ? "Marked complete automatically when you finish this step."
                          : "Click the button on the right to complete this step. We'll check it off automatically."
                      }
                    >
                      {step.done ? (
                        <CheckCircle2
                          className="h-4 w-4 text-green-600 dark:text-green-500"
                          aria-hidden
                        />
                      ) : (
                        <Circle
                          className="h-4 w-4 text-muted-foreground"
                          aria-hidden
                        />
                      )}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      aria-pressed={step.done}
                      aria-label={
                        step.done
                          ? `Mark "${copy.label}" as not done`
                          : `Mark "${copy.label}" as done`
                      }
                      onClick={() => toggleStep(step.id, step.done)}
                      className={cn(
                        "mt-0.5 shrink-0 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isPending && "opacity-50",
                      )}
                    >
                      {step.done ? (
                        <CheckCircle2
                          className="h-4 w-4 text-green-600 dark:text-green-500"
                          aria-hidden
                        />
                      ) : (
                        <Circle
                          className="h-4 w-4 text-muted-foreground"
                          aria-hidden
                        />
                      )}
                    </button>
                  )}
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "flex flex-wrap items-center gap-2 text-sm font-medium",
                        step.done && "text-muted-foreground line-through",
                      )}
                    >
                      {copy.label}
                      {step.optional ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground no-underline">
                          Optional
                        </span>
                      ) : null}
                      {step.autoDone ? (
                        <span className="text-[10px] font-normal normal-case text-green-700 dark:text-green-400">
                          Completed
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {copy.helper}
                      {step.id === "google" ? (
                        <>
                          {" "}
                          <Link
                            href={href}
                            className="font-medium text-foreground underline underline-offset-4"
                          >
                            What is this?
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
                {!step.done ? (
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="shrink-0 sm:ml-2"
                  >
                    <Link href={href}>
                      {step.id === "scan" && !firstCommunityId
                        ? "Add community"
                        : copy.cta}
                    </Link>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
