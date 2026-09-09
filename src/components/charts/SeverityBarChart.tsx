"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const COLORS: Record<string, string> = {
  critical: "#cf222e",
  high: "#bc4c00",
  medium: "#9a6700",
  low: "#0969da",
  info: "#6e7781",
};

export function SeverityBarChart({
  counts,
  colors,
}: {
  counts: Record<string, number>;
  /** Override the default severity color map — lets this double as a generic category bar chart. */
  colors?: Record<string, string>;
}) {
  const palette = colors ?? COLORS;
  const data = Object.entries(counts).map(([severity, count]) => ({ severity, count }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#d8dee4" />
        <XAxis dataKey="severity" stroke="#656d76" fontSize={11} />
        <YAxis stroke="#656d76" fontSize={11} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "#f6f8fa" }}
          contentStyle={{ background: "#ffffff", border: "1px solid #d0d7de", borderRadius: 6, fontSize: 12 }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.severity} fill={palette[entry.severity] ?? "#6e7781"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
