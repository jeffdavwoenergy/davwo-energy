import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "critical" | "info" | "neutral";

const TONE: Record<Tone, string> = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 dark:hover:bg-emerald-500/15",
  warning: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 dark:hover:bg-amber-500/15",
  critical: "bg-red-50 text-red-700 border-red-200 hover:bg-red-50 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30 dark:hover:bg-red-500/15",
  info: "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-50 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30 dark:hover:bg-sky-500/15",
  neutral: "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30 dark:hover:bg-slate-500/15",
};

const DOT: Record<Tone, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
  info: "bg-sky-500",
  neutral: "bg-slate-400",
};

export default function StatusPill({
  tone = "neutral",
  children,
  dot = true,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 rounded-full font-semibold", TONE[tone])}>
      {dot && <span className={cn("inline-block h-1.5 w-1.5 rounded-full", DOT[tone])} />}
      {children}
    </Badge>
  );
}
