export function ProgressBar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label?: string;
}) {
  const safeMax = max > 0 ? max : 0;
  const pct =
    safeMax === 0 ? 0 : Math.min(100, Math.max(0, (value / safeMax) * 100));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{label ?? "Progress"}</span>
        <span className="tabular-nums">
          {safeMax > 0 ? `${value} / ${safeMax}` : `${value}`}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={safeMax || undefined}
      >
        <div
          className="h-full rounded-full bg-foreground/80 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
