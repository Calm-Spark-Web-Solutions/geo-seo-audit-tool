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
  gsc_clicks?: number | null;
  ga4_sessions?: number | null;
}

const SCORE_KEYS = [
  { key: "score", label: "Overall", stroke: "var(--chart-1)" },
  { key: "seo_score", label: "SEO", stroke: "var(--chart-2)" },
  { key: "geo_score", label: "GEO", stroke: "var(--chart-3)" },
] as const;

const TRAFFIC_KEYS = [
  { key: "gsc_clicks", label: "GSC clicks", stroke: "var(--chart-4)" },
  { key: "ga4_sessions", label: "GA4 sessions", stroke: "var(--chart-5)" },
] as const;

const CHART_HEIGHT_PX = 224;

export default function AuditTrendChart({
  points,
  showTraffic = false,
}: {
  points: TrendPoint[];
  showTraffic?: boolean;
}) {
  const keys = showTraffic ? [...SCORE_KEYS, ...TRAFFIC_KEYS] : SCORE_KEYS;

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
            yAxisId="score"
            domain={[0, 100]}
            tick={{ fontSize: 12 }}
            stroke="var(--muted-foreground)"
            width={32}
          />
          {showTraffic ? (
            <YAxis
              yAxisId="traffic"
              orientation="right"
              tick={{ fontSize: 12 }}
              stroke="var(--muted-foreground)"
              width={40}
            />
          ) : null}
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
          {keys.map(({ key, label, stroke }) => {
            const isTraffic = key === "gsc_clicks" || key === "ga4_sessions";
            return (
              <Line
                key={key}
                yAxisId={isTraffic ? "traffic" : "score"}
                type="monotone"
                dataKey={key}
                name={label}
                stroke={stroke}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 4 }}
                connectNulls
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
