"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { deltaClass, deltaLabel } from "@/lib/format";

type Tone = "mint" | "sky" | "lavender" | "peach" | "amber" | "white";

const TONE: Record<Tone, string> = {
  mint: "bg-mint",
  sky: "bg-skytint",
  lavender: "bg-lavender",
  peach: "bg-peach",
  amber: "bg-ambertint",
  white: "bg-card",
};

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  delta?: number | null;
  invertDelta?: boolean;
  tone?: Tone;
  icon?: LucideIcon;
  live?: boolean;
  caption?: string;
}

export default function KpiCard({
  label,
  value,
  unit,
  delta,
  invertDelta = false,
  tone = "white",
  icon: Icon,
  live = false,
  caption,
}: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`relative rounded-2xl p-5 shadow-sm border border-border ${TONE[tone]}`}
    >
      {live && (
        <span className="absolute right-4 top-4 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-70 animate-soft-pulse" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
      )}
      <div className="flex items-center gap-3 mb-3">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-background/40 flex items-center justify-center text-foreground/80">
            <Icon size={20} strokeWidth={1.75} />
          </div>
        )}
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <div className="text-3xl font-semibold tracking-tight text-foreground font-display">{value}</div>
        {unit && <div className="text-sm font-medium text-muted-foreground">{unit}</div>}
      </div>
      {delta != null && (
        <div className={`mt-3 text-xs font-medium ${deltaClass(delta, invertDelta)}`}>
          {deltaLabel(delta)} <span className="text-muted-foreground font-normal">vs yesterday</span>
        </div>
      )}
      {caption && delta == null && <div className="mt-3 text-xs text-muted-foreground">{caption}</div>}
    </motion.div>
  );
}
