"use client";

import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from "recharts";

const MAX = 400; // gCO2/kWh upper bound for the dial

function colorFor(index?: string | null, value?: number) {
  const idx = (index ?? "").toLowerCase();
  if (idx.includes("very low") || idx === "low") return "#22c55e";
  if (idx === "moderate") return "#f59e0b";
  if (idx.includes("high")) return "#ef4444";
  // fall back to value thresholds
  if (value == null) return "#94a3b8";
  if (value < 120) return "#22c55e";
  if (value < 220) return "#f59e0b";
  return "#ef4444";
}

/** Radial gauge for live UK grid carbon intensity. */
export default function CarbonGauge({
  intensity,
  index,
}: {
  intensity?: number | null;
  index?: string | null;
}) {
  const value = intensity ?? 0;
  const fill = colorFor(index, intensity ?? undefined);
  const data = [{ value: Math.min(value, MAX), fill }];

  return (
    <div className="relative h-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="72%"
          outerRadius="100%"
          data={data}
          startAngle={220}
          endAngle={-40}
          barSize={16}
        >
          <PolarAngleAxis type="number" domain={[0, MAX]} angleAxisId={0} tick={false} />
          <RadialBar dataKey="value" cornerRadius={10} background={{ fill: "hsl(var(--muted))" }} angleAxisId={0} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-3xl font-display font-bold text-foreground">
          {intensity != null ? Math.round(intensity) : "—"}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">gCO₂/kWh</div>
        {index && (
          <div
            className="mt-1 text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ color: fill, backgroundColor: `${fill}1a` }}
          >
            {index}
          </div>
        )}
      </div>
    </div>
  );
}
