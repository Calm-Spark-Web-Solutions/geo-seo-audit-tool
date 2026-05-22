"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

export function BillingSuccessAlert({ stripeSubId }: Props) {
  const router = useRouter();
  const [baselineSubId] = useState(() => stripeSubId);
  const [attempts, setAttempts] = useState(0);

  const succeeded = stripeSubId !== baselineSubId;
  const stale = !succeeded && attempts >= MAX_REFRESH_ATTEMPTS;

  useEffect(() => {
    if (succeeded || stale) return;

    const t = setTimeout(() => {
      setAttempts((a) => a + 1);
      router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [succeeded, stale, attempts, router]);

  if (succeeded) {
    return (
      <Banner tone="ok" Icon={CheckCircle2} title="You're all set">
        Your subscription is active and your plan limits are up to date.
      </Banner>
    );
  }

  if (stale) {
    return (
      <Banner
        tone="warn"
        Icon={AlertCircle}
        title="Payment received — still finalizing"
      >
        Your payment went through, but we&rsquo;re still finalizing your plan
        on our side. The card below may show your previous limits for another
        minute or two. Refresh this page in a bit, or contact support if it
        doesn&rsquo;t update.
      </Banner>
    );
  }

  return (
    <Banner tone="ok" Icon={Loader2} iconSpin title="Finalizing your subscription">
      Hang on — we&rsquo;re finalizing your plan. Your usage meters will
      update in a moment.
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
