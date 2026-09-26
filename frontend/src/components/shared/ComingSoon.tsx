import { Construction } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";

/** Placeholder for tabs being wired in later phases — keeps the shell navigable. */
export default function ComingSoon({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="bg-card rounded-2xl border border-dashed border-border p-12 text-center">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300 flex items-center justify-center">
          <Construction size={22} />
        </div>
        <div className="mt-4 font-display font-semibold text-lg text-foreground">
          Being wired to real data
        </div>
        <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
          This tab is part of the production rebuild. It will be connected to real UK energy data
          and the ANI™ engine in an upcoming phase.
        </p>
      </div>
    </div>
  );
}
