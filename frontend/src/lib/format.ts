/** Formatting + delta helpers (en-GB). */

export const formatGBP = (n?: number | null, opts: Intl.NumberFormatOptions = {}) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
    ...opts,
  }).format(n ?? 0);

export const formatNumber = (n?: number | null, decimals = 0) =>
  new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n ?? 0);

export const cn = (...c: Array<string | false | null | undefined>) =>
  c.filter(Boolean).join(" ");

/** File size for uploaded documents — small manuals (a plain-text spec sheet
 * can be well under 1KB) rounded straight to "0 KB" reads as a bug, so bytes
 * get their own unit below that threshold. */
export const formatFileSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(0)} KB`;

export const deltaLabel = (pct?: number | null) => {
  if (pct == null) return "";
  const sign = pct > 0 ? "↑" : pct < 0 ? "↓" : "→";
  return `${sign} ${Math.abs(pct)}%`;
};

export const deltaClass = (pct?: number | null, invert = false) => {
  if (pct == null) return "text-muted-foreground";
  const positive = invert ? pct < 0 : pct > 0;
  if (pct === 0) return "text-muted-foreground";
  return positive ? "delta-up" : "delta-down";
};
