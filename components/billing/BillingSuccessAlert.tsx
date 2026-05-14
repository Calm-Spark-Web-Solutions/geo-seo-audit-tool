"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Props {
  /**
   * Server-rendered `subscriptions.stripe_sub_id` for the current user at
   * page-load time. We snapshot this on first render and watch for the
   * value to change on subsequent re-renders after `router.refresh()` —
   * a change means the Stripe webhook has landed and our row has been
   * upserted, so we can swap to the confirmed success copy.
   */
  stripeSubId: string | null;
}

const REFRESH_INTERVAL_MS = 3000;
const MAX_REFRESH_ATTEMPTS = 5;

type Phase = "waiting" | "success" | "stale";

export function BillingSuccessAlert({ stripeSubId }: Props) {
  const router = useRouter();
  const initialRef = useRef<string | null>(stripeSubId);
  const [attempts, setAttempts] = useState(0);
  const [phase, setPhase] = useState<Phase>(() =>
    stripeSubId !== null && stripeSubId !== "" ? "waiting" : "waiting",
  );

  useEffect(() => {
    if (phase !== "waiting") return;

    if (stripeSubId !== initialRef.current) {
      setPhase("success");
      return;
    }

    if (attempts >= MAX_REFRESH_ATTEMPTS) {
      setPhase("stale");
      return;
    }

    const t = setTimeout(() => {
      setAttempts((a) => a + 1);
      router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [stripeSubId, phase, attempts, router]);

  if (phase === "success") {
    return (
      <Banner tone="ok" Icon={CheckCircle2} title="Subscription updated">
        Your plan, community count, and Page Pack allowance are now in sync
        with Stripe.
      </Banner>
    );
  }

  if (phase === "stale") {
    return (
      <Banner
        tone="warn"
        Icon={AlertCircle}
        title="Stripe accepted your payment, but we haven\u2019t received the webhook yet"
      >
        Charges went through on Stripe&rsquo;s side. The plan card below may
        still show your previous limits until the{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          customer.subscription.created
        </code>{" "}
        event reaches{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          /api/stripe/webhook
        </code>
        . In local dev, make sure{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          stripe listen --forward-to localhost:3000/api/stripe/webhook
        </code>{" "}
        is running and its <code className="rounded bg-muted px-1 py-0.5 text-xs">whsec_*</code>{" "}
        matches your <code className="rounded bg-muted px-1 py-0.5 text-xs">STRIPE_WEBHOOK_SECRET</code>.
        You can replay the event from Stripe Dashboard &rarr; Developers &rarr; Events.
      </Banner>
    );
  }

  return (
    <Banner tone="ok" Icon={Loader2} iconSpin title="Confirming with Stripe">
      Your payment went through. Waiting for the subscription webhook to land
      so the plan card and usage meters update&hellip;
    </Banner>
  );
}

function Banner({
  tone,
  Icon,
  iconSpin = false,
  title,
  children,
}: {
  tone: "ok" | "warn";
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  iconSpin?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  const border =
    tone === "ok"
      ? "border-emerald-600/40 bg-emerald-950/20"
      : "border-amber-600/40 bg-amber-950/15";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex gap-3 rounded-lg border p-4 text-sm ${border}`}
    >
      <Icon
        className={`mt-0.5 size-4 shrink-0 opacity-90 ${
          iconSpin ? "animate-spin" : ""
        }`}
        aria-hidden
      />
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
