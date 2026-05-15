/**
 * HeroBand — top-of-dashboard card with:
 *   Left: portfolio score ring + SEO/GEO subscores + AI insight copy
 *   Right: 8-point SEO/GEO trend line chart
 *   Bottom strip: 3 KPI stats
 *
 * Pure server component — no client deps.
 */

import { Activity, Globe2, Zap } from "lucide-react";

import { DeltaPill } from "@/components/dashboard/DeltaPill";
import { ScoreRing } from "@/components/audits/ScoreRing";
import { Card } from "@/components/ui/card";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HeroBandProps {
  score: number | null;
  delta: number;
  avgSeo: number | null;
  avgGeo: number | null;
  /** 8 data points oldest→newest for SEO trend line */
  trendSeo: number[];
  /** 8 data points oldest→newest for GEO trend line */
  trendGeo: number[];
  communityCount: number;
  totalScans: number;
  scansThisMonth: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreFgClass(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-700 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function scoreBarColor(score: number | null): string {
  if (score === null) return "bg-muted-foreground/25";
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-400";
  return "bg-destructive";
}

function visibilityInsight(score: number | null): {
  text: React.ReactNode;
} {
  if (score === null) {
    return { text: "Run a visibility scan to see how your communities show up across Google and AI assistants." };
  }
  if (score >= 80) {
    return {
      text: (
        <>
          Your communities are being <strong className="text-foreground">Cited</strong> by AI assistants as top answers.
          Keep publishing and refreshing content to maintain this momentum.
        </>
      ),
    };
  }
  if (score >= 65) {
    return {
      text: (
        <>
          Your communities are <strong className="text-foreground">Listed</strong> by AI assistants but rarely cited as
          the top answer. Push to <strong className="text-foreground">Cited</strong> by closing the top fixes below.
        </>
      ),
    };
  }
  if (score >= 50) {
    return {
      text: (
        <>
          Your communities appear <strong className="text-foreground">occasionally</strong> in AI searches. Improve
          schema markup and content depth to become consistently{" "}
          <strong className="text-foreground">Listed</strong>.
        </>
      ),
    };
  }
  return {
    text: (
      <>
        Your communities are <strong className="text-foreground">rarely surfaced</strong> by AI assistants. Focus on
        SEO fundamentals and structured data to start appearing in results.
      </>
    ),
  };
}

// ─── Trend chart (SVG) ────────────────────────────────────────────────────────

function TrendChart({ seo, geo }: { seo: number[]; geo: number[] }) {
  if (seo.length < 2 || geo.length < 2) return null;

  const W = 560;
  const H = 160;
  const padX = 8;
  const padY = 16;

  const all = [...seo, ...geo];
  const minV = Math.max(0, Math.min(...all) - 8);
  const maxV = Math.min(100, Math.max(...all) + 8);
  const range = maxV - minV || 1;

  const xFor = (i: number, len: number) =>
    padX + (i / (len - 1)) * (W - padX * 2);
  const yFor = (v: number) =>
    padY + (1 - (v - minV) / range) * (H - padY * 2);

  const seoPts = seo
    .map((v, i) => `${xFor(i, seo.length).toFixed(1)},${yFor(v).toFixed(1)}`)
    .join(" ");
  const geoPts = geo
    .map((v, i) => `${xFor(i, geo.length).toFixed(1)},${yFor(v).toFixed(1)}`)
    .join(" ");

  const yTicks = [maxV, (maxV + minV) / 2, minV];

  // X-axis labels: infer from length (assume each point = 1 week back from now)
  const xLabels = seo.map((_, i) => {
    const weeksAgo = seo.length - 1 - i;
    return weeksAgo === 0 ? "now" : `−${weeksAgo}w`;
  });

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H + 18}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {/* Y grid lines */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line
            x1={padX}
            x2={W - padX - 22}
            y1={yFor(v)}
            y2={yFor(v)}
            stroke="currentColor"
            strokeOpacity="0.12"
            strokeDasharray={i === 1 ? undefined : "3 4"}
          />
          <text
            x={W - padX - 18}
            y={yFor(v) + 3}
            fontSize="9"
            fill="currentColor"
            fillOpacity="0.45"
            fontFamily="var(--font-mono, monospace)"
            textAnchor="start"
          >
            {Math.round(v)}
          </text>
        </g>
      ))}

      {/* X labels */}
      {xLabels.map((label, i) => (
        <text
          key={i}
          x={xFor(i, seo.length)}
          y={H + 10}
          fontSize="9"
          fill="currentColor"
          fillOpacity="0.45"
          textAnchor="middle"
          fontFamily="var(--font-sans, sans-serif)"
        >
          {label}
        </text>
      ))}

      {/* SEO line (primary brand color) */}
      <polyline
        points={seoPts}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {seo.map((v, i) => (
        <circle
          key={i}
          cx={xFor(i, seo.length)}
          cy={yFor(v)}
          r={i === seo.length - 1 ? 3.5 : 2}
          fill="hsl(var(--primary))"
        />
      ))}

      {/* GEO line (emerald) */}
      <polyline
        points={geoPts}
        fill="none"
        stroke="#059669"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {geo.map((v, i) => (
        <circle
          key={i}
          cx={xFor(i, geo.length)}
          cy={yFor(v)}
          r={i === geo.length - 1 ? 3.5 : 2}
          fill="#059669"
        />
      ))}
    </svg>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SubscoreStat({
  label,
  score,
}: {
  label: string;
  score: number | null;
}) {
  const pct = score != null ? Math.max(0, Math.min(100, score)) : 0;
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={`text-xl font-bold tabular-nums leading-none ${scoreFgClass(score)}`}>
        {score ?? "—"}
      </p>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${scoreBarColor(score)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function KpiStat({
  icon: Icon,
  label,
  value,
  hint,
  first,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  hint: string;
  first?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 px-6 py-4 ${first ? "" : "border-l border-border"}`}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="text-2xl font-bold tabular-nums leading-none text-foreground">
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function HeroBand({
  score,
  delta,
  avgSeo,
  avgGeo,
  trendSeo,
  trendGeo,
  communityCount,
  totalScans,
  scansThisMonth,
}: HeroBandProps) {
  const { text: insightText } = visibilityInsight(score);
  const hasTrend = trendSeo.length >= 2 && trendGeo.length >= 2;

  return (
    <Card className="overflow-hidden p-0">
      {/* Top row: score left / trend right */}
      <div className={`grid ${hasTrend ? "grid-cols-[minmax(260px,360px)_1fr]" : ""}`}>
        {/* ── Left: score ring + subscores + insight ── */}
        <div
          className={`flex flex-col gap-5 p-7 ${hasTrend ? "border-r border-border" : ""}`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Portfolio visibility score · 30d rollup
          </p>

          {/* Ring + number */}
          <div className="flex items-center gap-5">
            <ScoreRing score={score} size={100} strokeWidth={11} />
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`text-4xl font-bold tabular-nums leading-none ${scoreFgClass(score)}`}
                >
                  {score ?? "—"}
                </span>
                <span className="text-base font-medium text-muted-foreground">
                  / 100
                </span>
              </div>
              <div className="flex items-center gap-2">
                <DeltaPill delta={delta} size="md" />
                <span className="text-xs text-muted-foreground">
                  vs prior 30d
                </span>
              </div>
            </div>
          </div>

          {/* SEO / GEO subscores */}
          <div className="flex gap-5">
            <SubscoreStat label="SEO" score={avgSeo} />
            <SubscoreStat label="GEO" score={avgGeo} />
          </div>

          {/* Insight copy */}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {insightText}
          </p>
        </div>

        {/* ── Right: trend chart ── */}
        {hasTrend && (
          <div className="flex flex-col gap-4 p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  8-week trend
                </p>
                <p className="mt-1 text-sm text-foreground">
                  Average SEO and GEO scores across all communities
                </p>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  SEO
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  GEO
                </span>
              </div>
            </div>
            <TrendChart seo={trendSeo} geo={trendGeo} />
          </div>
        )}
      </div>

      {/* ── Bottom KPI strip ── */}
      <div className="grid grid-cols-3 border-t border-border bg-muted/30">
        <KpiStat
          icon={Globe2}
          label="Communities"
          value={communityCount}
          hint="In this organization"
          first
        />
        <KpiStat
          icon={Activity}
          label="Scans this month"
          value={scansThisMonth}
          hint={`${totalScans.toLocaleString()} all-time`}
        />
        <KpiStat
          icon={Zap}
          label="Total scans"
          value={totalScans.toLocaleString()}
          hint="All-time runs"
        />
      </div>
    </Card>
  );
}
