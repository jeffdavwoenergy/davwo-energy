"use client";

import {
  ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip,
  LineChart, Line, Area, BarChart, Bar, PieChart, Pie, Cell, ComposedChart, Legend,
} from "recharts";
import type { Block } from "@/lib/ani/blocks";
import StatusPill from "@/components/shared/StatusPill";

const SEV_TONE = { high: "critical", medium: "warning", low: "info", info: "neutral" } as const;
const AXIS = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const TOOLTIP = {
  borderRadius: 12,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  fontSize: 12,
};

/** Minimal **bold** parser so the assistant's text reads naturally. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="text-sm text-foreground/90 leading-relaxed">
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

function ChartBlock({ block }: { block: Extract<Block, { type: "chart" }> }) {
  const { chartType, title, data, unit, band } = block;
  return (
    <div className="rounded-xl border border-border p-3">
      {title && <div className="text-xs font-semibold text-muted-foreground mb-2">{title}</div>}
      <ResponsiveContainer width="100%" height={chartType === "pie" ? 240 : 220}>
        {chartType === "pie" ? (
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={52} outerRadius={84} paddingAngle={2}>
              {data.map((d, i) => <Cell key={i} fill={d.color ?? "hsl(var(--chart-1))"} />)}
            </Pie>
            <Tooltip formatter={(v) => `${v}${unit ?? ""}`} contentStyle={TOOLTIP} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        ) : chartType === "bar" ? (
          <BarChart data={data} margin={{ left: -18, top: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={36} unit={unit} />
            <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "hsl(var(--accent))" }} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {data.map((d, i) => <Cell key={i} fill={d.color ?? "hsl(var(--chart-1))"} />)}
            </Bar>
          </BarChart>
        ) : chartType === "area" ? (
          <ComposedChart data={data} margin={{ left: -18, top: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={36} unit={unit} />
            <Tooltip contentStyle={TOOLTIP} />
            {band && <Area type="monotone" dataKey="upper" stroke="none" fill="hsl(var(--chart-2))" fillOpacity={0.14} />}
            {band && <Area type="monotone" dataKey="lower" stroke="none" fill="hsl(var(--card))" fillOpacity={1} />}
            <Line type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" strokeWidth={2.5} dot={false} />
          </ComposedChart>
        ) : (
          <LineChart data={data} margin={{ left: -18, top: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={36} unit={unit} />
            <Tooltip contentStyle={TOOLTIP} />
            <Line type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" strokeWidth={2.5} dot={false} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export default function RenderBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "text":
      return <RichText text={block.text} />;

    case "kpis":
      return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {block.items.map((k, i) => (
            <div key={i} className="rounded-xl border border-border p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                {k.label}
                {k.live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-soft-pulse" />}
              </div>
              <div className="text-lg font-semibold text-foreground mt-0.5 font-display">
                {k.value}
                {k.unit && <span className="text-xs font-normal text-muted-foreground ml-1">{k.unit}</span>}
              </div>
            </div>
          ))}
        </div>
      );

    case "chart":
      return <ChartBlock block={block} />;

    case "table":
      return (
        <div className="rounded-xl border border-border overflow-hidden">
          {block.title && <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border">{block.title}</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  {block.columns.map((c, i) => <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">{c}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {block.rows.map((row, ri) => (
                  <tr key={ri} className="hover:bg-accent/60">
                    {row.map((cell, ci) => <td key={ci} className="px-3 py-2 text-foreground/90 whitespace-nowrap">{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );

    case "insight":
      return (
        <div className="rounded-xl border border-border p-3">
          <div className="flex items-center gap-2">
            <StatusPill tone={SEV_TONE[block.severity]}>{block.severity}</StatusPill>
            <span className="text-sm font-semibold text-foreground">{block.title}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{block.detail}</p>
          {block.recommendation && (
            <div className="mt-2 text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 rounded-lg px-2.5 py-1.5">{block.recommendation}</div>
          )}
        </div>
      );

    default:
      return null;
  }
}
