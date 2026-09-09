"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type LegendProps,
} from "recharts";

const COLORS: Record<string, string> = {
  critical: "#cf222e",
  high: "#bc4c00",
  medium: "#9a6700",
  low: "#0969da",
  info: "#6e7781",
};

const SEVERITY_KEYS = Object.keys(COLORS);

function SeverityLegend({ payload, colors }: Pick<LegendProps, "payload"> & { colors: Record<string, string> }) {
  if (!payload?.length) return null;
  return (
    <ul className="severity-legend">
      {payload.map((entry) => {
        const key = String(entry.value);
        const color = colors[key] ?? "#6e7781";
        return (
          <li key={key}>
            <span className="severity-legend-swatch" style={{ backgroundColor: color }} />
            <span className="severity-legend-label">{key}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function SeverityTrendChart({
  data,
  keys,
  colors,
}: {
  data: Array<Record<string, string | number>>;
  /** Restrict which series render — a domain with fewer severities (e.g. leak findings: no critical/info) shouldn't show phantom empty swatches. */
  keys?: string[];
  colors?: Record<string, string>;
}) {
  const seriesKeys = keys ?? SEVERITY_KEYS;
  const palette = colors ?? COLORS;
  const hasActivity = data.some((row) =>
    Object.entries(row).some(([key, value]) => key !== "date" && Number(value) > 0)
  );

  if (data.length === 0 || !hasActivity) {
    return <p className="muted">No findings in this period.</p>;
  }

  // Today / Yesterday only have one X point — an area chart collapses to dots.
  // A stacked bar reads clearly for a single-day open inventory.
  const singleDay = data.length === 1;

  return (
    <ResponsiveContainer width="100%" height={280}>
      {singleDay ? (
        <BarChart data={data} barCategoryGap="55%">
          <CartesianGrid strokeDasharray="3 3" stroke="#d8dee4" />
          <XAxis dataKey="date" stroke="#656d76" fontSize={11} />
          <YAxis stroke="#656d76" fontSize={11} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "#f6f8fa" }}
            contentStyle={{ background: "#ffffff", border: "1px solid #d0d7de", borderRadius: 6, fontSize: 12 }}
          />
          <Legend content={(props) => <SeverityLegend payload={props.payload} colors={palette} />} />
          {seriesKeys.map((severity, i) => (
            <Bar
              key={severity}
              dataKey={severity}
              stackId="1"
              fill={palette[severity]}
              radius={i === seriesKeys.length - 1 ? [4, 4, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      ) : (
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d8dee4" />
          <XAxis dataKey="date" stroke="#656d76" fontSize={11} />
          <YAxis stroke="#656d76" fontSize={11} allowDecimals={false} />
          <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #d0d7de", borderRadius: 6, fontSize: 12 }} />
          <Legend content={(props) => <SeverityLegend payload={props.payload} colors={palette} />} />
          {seriesKeys.map((severity) => (
            <Area
              key={severity}
              type="monotone"
              dataKey={severity}
              stackId="1"
              stroke="#ffffff"
              strokeWidth={2}
              fill={palette[severity]}
              fillOpacity={0.85}
            />
          ))}
        </AreaChart>
      )}
    </ResponsiveContainer>
  );
}
