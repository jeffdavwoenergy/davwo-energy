import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface StatusItem {
  label: string;
  value: ReactNode;
  dot?: boolean;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  status?: StatusItem[];
  right?: ReactNode;
}

export default function PageHeader({ title, subtitle, status = [], right }: PageHeaderProps) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-3xl lg:text-4xl font-display font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-1 text-sm max-w-2xl">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {status.map((s, i) => (
          <Card key={i} className="shadow-sm">
            <CardContent className="px-3 py-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
              <div className="text-sm font-semibold mt-0.5 flex items-center gap-1.5">
                {s.dot && <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-soft-pulse" />}
                {s.value}
              </div>
            </CardContent>
          </Card>
        ))}
        {right}
      </div>
    </div>
  );
}
