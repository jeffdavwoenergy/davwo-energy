"use client";

import useSWR from "swr";
import type { AxiosInstance } from "axios";
import { BadgeCheck, Check, Sparkles, Store, ArrowRight, type LucideIcon } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import Panel, { Skeleton } from "@/components/shared/Panel";
import { Button } from "@/components/ui/button";
import { useLocale } from "next-intl";
import { performSwitch, PLATFORM_PATHS, type Platform } from "@/lib/portalSwitch";
import type { Membership, MembershipTier } from "@/lib/server/membership";


const TIER: Record<MembershipTier, { label: string; tone: string; blurb: string }> = {
  full: {
    label: "Full membership",
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
    blurb: "You have both ANI™ and the Supplier Portal on this email. Switch between them from the top bar.",
  },
  ani: {
    label: "ANI™ membership",
    tone: "bg-sky-50 text-sky-700 border-sky-200",
    blurb: "You have ANI™ infrastructure intelligence. Add a Supplier Portal account on the same email for Full membership.",
  },
  supplier: {
    label: "Supplier membership",
    tone: "bg-purple-50 text-purple-700 border-purple-200",
    blurb: "You have the Supplier Portal. Add ANI™ on the same email for Full membership.",
  },
};

const PLATFORMS: Record<Platform, { name: string; detail: string; icon: LucideIcon }> = {
  ani: { name: "ANI™", detail: "Infrastructure intelligence — monitoring, forecasting, reports", icon: Sparkles },
  supplier: { name: "Supplier Portal", detail: "Marketplace listings, enquiries and analytics", icon: Store },
};

/**
 * Shared Settings section for both platforms: the membership tier (ANI™,
 * Supplier, or Full when the same email has both) and a card per platform.
 * `client` is the current platform's axios instance, so its session token
 * authenticates the lookup.
 */
export default function MembershipPanel({ current, client }: { current: Platform; client: AxiosInstance }) {
  const router = useRouter();
  const locale = useLocale();
  const { data } = useSWR<Membership>(["/membership", current], ([url]: [string]) => client.get(url).then((r) => r.data));

  return (
    <Panel
      title="Membership"
      subtitle={data ? `For ${data.email}` : undefined}
      right={data && (
        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${TIER[data.tier].tone}`}>
          <BadgeCheck size={14} /> {TIER[data.tier].label}
        </span>
      )}
    >
      {!data ? (
        <Skeleton className="h-28" />
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">{TIER[data.tier].blurb}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {(Object.keys(PLATFORMS) as Platform[]).map((id) => {
              const p = PLATFORMS[id];
              const Icon = p.icon;
              const has = data[id];
              const here = id === current;
              return (
                <div key={id} className={`rounded-xl border p-4 flex flex-col gap-3 ${has ? "border-border" : "border-dashed border-border bg-muted/40"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${has ? "bg-mint text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                        {p.name}
                        {has ? (
                          <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-700"><Check size={12} /> Included</span>
                        ) : (
                          <span className="text-[11px] font-medium text-muted-foreground">Not included</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{p.detail}</div>
                    </div>
                  </div>
                  {here ? (
                    <div className="text-xs font-medium text-muted-foreground">You&apos;re using this now</div>
                  ) : has ? (
                    <Button size="sm" variant="outline" className="self-start gap-1.5" onClick={async () => {
                      const next = await performSwitch(current, id, data);
                      if (next.reload) window.location.assign(`/${locale}${next.reload}`);
                      else if (next.navigate) router.push(next.navigate);
                    }}>
                      Switch to {p.name} <ArrowRight size={14} />
                    </Button>
                  ) : (
                    <Button size="sm" asChild className="self-start gap-1.5">
                      <Link href={PLATFORM_PATHS[id].join}>Join {p.name} <ArrowRight size={14} /></Link>
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Panel>
  );
}
