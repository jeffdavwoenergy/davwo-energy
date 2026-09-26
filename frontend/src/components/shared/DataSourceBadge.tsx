import { Radio, FlaskConical } from "lucide-react";

/**
 * Communicates, at a glance, whether the numbers on screen are LIVE (from real
 * public APIs) or SYNTHETIC (modelled). Central to the "clearer & more informative"
 * goal — every data surface should declare its provenance.
 */
export default function DataSourceBadge({
  mode,
  sources = [],
  updatedAt,
}: {
  mode: "live" | "synthetic" | string;
  sources?: string[];
  updatedAt?: number | string;
}) {
  const live = mode === "live";
  const when =
    updatedAt != null
      ? new Date(typeof updatedAt === "number" ? updatedAt * 1000 : updatedAt).toLocaleTimeString(
          "en-GB",
          { hour: "2-digit", minute: "2-digit" },
        )
      : null;

  const label = live ? "Live data" : "Synthetic";
  const detail = sources.filter((s) => s !== "synthetic").join(" · ");

  return (
    <span
      title={live ? `Live sources: ${detail || "—"}` : "Modelled / demonstration data"}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
        live
          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30"
          : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30"
      }`}
    >
      {live ? (
        <Radio size={13} className="animate-soft-pulse" />
      ) : (
        <FlaskConical size={13} />
      )}
      {label}
      {when && <span className="font-normal text-muted-foreground">· {when}</span>}
    </span>
  );
}
