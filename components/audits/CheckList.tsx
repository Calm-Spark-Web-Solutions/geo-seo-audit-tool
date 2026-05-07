import { CircleAlert, CircleCheck, CircleX } from "lucide-react";

import type { AuditCheck, CheckResult } from "@/types";

function Icon({ result }: { result: CheckResult }) {
  if (result === "pass") {
    return (
      <CircleCheck
        className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-500"
        aria-hidden
      />
    );
  }
  if (result === "warn") {
    return (
      <CircleAlert
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500"
        aria-hidden
      />
    );
  }
  return (
    <CircleX
      className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
      aria-hidden
    />
  );
}

export function CheckList({
  title,
  checks,
}: {
  title: string;
  checks: AuditCheck[];
}) {
  if (checks.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="flex flex-col gap-2">
        {checks.map((c) => (
          <li key={c.key} className="flex gap-2 text-sm">
            <Icon result={c.result} />
            <div>
              <span className="font-medium">{c.label}</span>
              <p className="text-muted-foreground">{c.explanation}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
