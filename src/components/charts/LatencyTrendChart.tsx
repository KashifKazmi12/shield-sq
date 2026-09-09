"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function LatencyTrendChart({ data }: { data: Array<{ date: string; avgLatencyMs: number | null }> }) {
  const hasActivity = data.some((row) => row.avgLatencyMs != null);

  if (data.length === 0 || !hasActivity) {
    return <p className="muted">No scans in this period.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#d8dee4" />
        <XAxis dataKey="date" stroke="#656d76" fontSize={11} />
        <YAxis stroke="#656d76" fontSize={11} unit="ms" />
        <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #d0d7de", borderRadius: 6, fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="avgLatencyMs"
          name="Avg latency"
          stroke="#1f6feb"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
