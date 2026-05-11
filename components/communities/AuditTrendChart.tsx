"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface TrendPoint {
  ts: number;
  date: string;
  score: number | null;
  seo_score: number | null;
  geo_score: number | null;
}

const CHART_KEYS = [
  { key: "score", label: "Overall", stroke: "var(--chart-1)" },
  { key: "seo_score", label: "SEO", stroke: "var(--chart-2)" },
  { key: "geo_score", label: "GEO", stroke: "var(--chart-3)" },
] as const;

/** Explicit px height avoids ResponsiveContainer measuring -1 when % height chains break (flex, hydration). */
const CHART_HEIGHT_PX = 224;

/**
 * Inner chart split out so `AuditTrend` can lazy-load it via
 * `next/dynamic`. Recharts is the single largest client dependency
 * (~150 kB gzipped), so isolating it in its own chunk keeps the
 * dashboard listing pages slim.
 */
export default function AuditTrendChart({ points }: { points: TrendPoint[] }) {
  return (
    <div className="w-full min-w-0" style={{ height: CHART_HEIGHT_PX }}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT_PX}>
      <LineChart
        data={points}
        margin={{ top: 8, right: 16, left: -8, bottom: 4 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          strokeOpacity={0.5}
        />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          stroke="var(--muted-foreground)"
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 12 }}
          stroke="var(--muted-foreground)"
          width={32}
        />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--foreground)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
        {CHART_KEYS.map(({ key, label, stroke }) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            name={label}
            stroke={stroke}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 4 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
    </div>
  );
}
