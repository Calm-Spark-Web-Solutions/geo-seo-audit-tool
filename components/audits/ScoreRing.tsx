/**
 * Circular arc score gauge — pure SVG, no external deps.
 * Uses stroke="currentColor" + Tailwind text-color classes so dark mode
 * adapts automatically via CSS custom properties.
 */

function arcColorClass(score: number | null): string {
  if (score === null) return "text-muted-foreground/30";
  if (score >= 80) return "text-emerald-500";
  if (score >= 50) return "text-amber-400";
  return "text-destructive";
}

function labelColorClass(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-700 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

export function ScoreRing({
  score,
  size = 92,
  strokeWidth = 11,
}: {
  score: number | null;
  size?: number;
  strokeWidth?: number;
}) {
  const R = 50 - strokeWidth / 2 - 1; // keep arc inside the viewBox
  const C = 2 * Math.PI * R;
  const pct = score !== null ? Math.max(0, Math.min(100, score)) / 100 : 0;
  const dash = `${pct * C} ${C}`;
  const fontSize = size <= 56 ? 22 : 22; // consistent label size

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className="shrink-0"
      aria-hidden
    >
      {/* track */}
      <circle
        cx="50"
        cy="50"
        r={R}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted-foreground/20"
      />
      {/* filled arc */}
      <circle
        cx="50"
        cy="50"
        r={R}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={dash}
        transform="rotate(-90 50 50)"
        className={arcColorClass(score)}
      />
      {/* score label */}
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight="700"
        fill="currentColor"
        className={labelColorClass(score)}
      >
        {score ?? "—"}
      </text>
    </svg>
  );
}
