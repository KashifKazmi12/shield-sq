"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLORS: Record<string, string> = {
  critical: "#cf222e",
  high: "#bc4c00",
  medium: "#9a6700",
  low: "#0969da",
  info: "#6e7781",
};

export function SeverityTrendChart({ data }: { data: Array<Record<string, string | number>> }) {
  if (data.length === 0) {
    return <p className="muted">No findings in this period.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#d8dee4" />
        <XAxis dataKey="date" stroke="#656d76" fontSize={11} />
        <YAxis stroke="#656d76" fontSize={11} allowDecimals={false} />
        <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #d0d7de", borderRadius: 6, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {Object.keys(COLORS).map((severity) => (
          <Area
            key={severity}
            type="monotone"
            dataKey={severity}
            stackId="1"
            stroke="#ffffff"
            strokeWidth={2}
            fill={COLORS[severity]}
            fillOpacity={0.85}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
