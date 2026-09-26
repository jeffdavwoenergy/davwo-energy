"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import GlowCard from "@/components/shared/GlowCard";
import { deltaClass, deltaLabel } from "@/lib/format";

type Tone = "mint" | "sky" | "lavender" | "peach" | "amber" | "white";

// Soft icon-chip tint per tone (light-theme surfaces) — the card itself stays
// white, matching the reference dashboard's card look.
const CHIP: Record<Tone, string> = {
  mint: "bg-mint text-emerald-600",
  sky: "bg-skytint text-sky-600",
  lavender: "bg-lavender text-purple-600",
  peach: "bg-peach text-orange-600",
  amber: "bg-ambertint text-amber-600",
  white: "bg-muted text-foreground",
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
  defaultGlow?: boolean;
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
  defaultGlow = false,
}: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="h-full"
    >
      <GlowCard defaultGlow={defaultGlow} className="p-5 flex flex-col justify-between min-h-[140px]">
        <div className="flex items-center justify-between">
          {Icon && (
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${CHIP[tone]}`}>
              <Icon size={18} strokeWidth={1.9} />
            </div>
          )}
          {live && (
            <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
              <ArrowUpRight size={12} strokeWidth={2.4} /> Live
            </span>
          )}
        </div>

        <div className="mt-3.5 flex items-baseline gap-1.5">
          <div className="text-2xl font-bold tracking-tight text-foreground font-display tabular-nums">{value}</div>
          {unit && <div className="text-sm font-medium text-muted-foreground">{unit}</div>}
        </div>

        <div className="mt-auto pt-3">
          <div className="text-xs font-semibold text-foreground/80">{label}</div>
          {delta != null ? (
            <div className={`text-xs mt-0.5 font-medium ${deltaClass(delta, invertDelta)}`}>
              {deltaLabel(delta)} <span className="text-muted-foreground font-normal">vs yesterday</span>
            </div>
          ) : caption ? (
            <div className="text-xs text-muted-foreground mt-0.5">{caption}</div>
          ) : null}
        </div>
      </GlowCard>
    </motion.div>
  );
}
