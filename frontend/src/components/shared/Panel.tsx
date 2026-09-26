import type { ReactNode } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Titled card used across the dashboard tabs for visual consistency —
 * a thin wrapper over shadcn's Card so every page shares one definition of
 * "panel chrome" instead of hand-rolled borders/shadows per page. */
export default function Panel({
  title,
  subtitle,
  right,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={className}>
      {(title || right) && (
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-0">
          <div>
            {title && <CardTitle className="font-display text-lg">{title}</CardTitle>}
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {right}
        </CardHeader>
      )}
      <CardContent className={cn("p-5", bodyClassName)}>{children}</CardContent>
    </Card>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} />;
}

export function ErrorBox({ message = "Could not load data. Retrying…" }: { message?: string }) {
  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

export function EmptyBox({ message = "No data yet." }: { message?: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{message}</div>;
}
