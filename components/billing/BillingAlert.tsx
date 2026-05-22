import { AlertCircle, CheckCircle2 } from "lucide-react";

import { BillingSuccessAlert } from "./BillingSuccessAlert";

const MESSAGES: Record<
  string,
  { tone: "ok" | "warn" | "bad"; title: string; body: string }
> = {
  cancel: {
    tone: "warn",
    title: "Checkout canceled",
    body: "No changes were made. You can pick a plan anytime.",
  },
  unconfigured: {
    tone: "warn",
    title: "Billing unavailable",
    body: "Checkout is temporarily unavailable. Please contact support.",
  },
  missing_price: {
    tone: "warn",
    title: "Plan unavailable",
    body: "This plan is not currently available. Please contact support or choose a different plan.",
  },
  no_customer: {
    tone: "warn",
    title: "No billing profile yet",
    body: "Subscribe to a plan first — then you can open the customer portal.",
  },
  invalid: {
    tone: "bad",
    title: "Invalid request",
    body: "Try choosing a plan again from the cards below.",
  },
  error: {
    tone: "bad",
    title: "Something went wrong",
    body: "We couldn't complete that change. Try again, and contact support if it keeps happening.",
  },
};

export function BillingAlert({
  code,
  stripeSubId,
}: {
  code?: string;
  /**
   * Server-rendered `subscriptions.stripe_sub_id` for the current user.
   * Only used by the `success` branch (which polls for webhook arrival).
   */
  stripeSubId?: string | null;
}) {
  if (!code) return null;
  if (code === "success") {
    return <BillingSuccessAlert stripeSubId={stripeSubId ?? null} />;
  }
  if (!(code in MESSAGES)) return null;
  const msg = MESSAGES[code];
  const Icon = msg.tone === "ok" ? CheckCircle2 : AlertCircle;
  const border =
    msg.tone === "ok"
      ? "border-emerald-600/40 bg-emerald-950/20"
      : msg.tone === "warn"
        ? "border-amber-600/40 bg-amber-950/15"
        : "border-destructive/40 bg-destructive/10";

  return (
    <div
      role="status"
      className={`flex gap-3 rounded-lg border p-4 text-sm ${border}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0 opacity-90" aria-hidden />
      <div>
        <p className="font-medium text-foreground">{msg.title}</p>
        <p className="mt-1 text-muted-foreground">{msg.body}</p>
      </div>
    </div>
  );
}
