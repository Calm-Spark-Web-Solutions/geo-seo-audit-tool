"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Props {
  /** Short heading (e.g. "Could not load audit"). */
  title: string;
  /** User-facing description / underlying error message. */
  description?: string | null;
}

/**
 * Inline error card with a Retry button that re-runs the current Server
 * Component render via `router.refresh()`. Use it for **partial** load
 * failures inside a page where throwing to `error.tsx` would lose context.
 */
export function InlineErrorCard({ title, description }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3">
        <AlertTriangle
          className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? (
              <CardDescription>{description}</CardDescription>
            ) : null}
          </div>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => startTransition(() => router.refresh())}
            >
              <RotateCcw
                className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                aria-hidden
              />
              {pending ? "Retrying…" : "Retry"}
            </Button>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
