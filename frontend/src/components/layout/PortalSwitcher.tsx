"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Sparkles, Store, type LucideIcon } from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import api from "@/lib/api";
import supplierApi from "@/lib/supplierApi";
import { hasMatchingSession, performSwitch, type Platform } from "@/lib/portalSwitch";
import type { Membership } from "@/lib/server/membership";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const PORTALS: Record<Platform, { name: string; detail: string; icon: LucideIcon }> = {
  ani: { name: "ANI™", detail: "Infrastructure intelligence", icon: Sparkles },
  supplier: { name: "Supplier Portal", detail: "Listings & enquiries", icon: Store },
};

/**
 * Top-bar switch between the ANI™ platform and the Supplier Portal. They're
 * separate accounts with separate sessions, so where a switch lands depends
 * on the signed-in email's membership and on whose session (if any) the
 * other platform has in this browser — see switchTarget.
 */
export default function PortalSwitcher({ current }: { current: Platform }) {
  const router = useRouter();
  const locale = useLocale();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [matching, setMatching] = useState(false);
  const other: Platform = current === "ani" ? "supplier" : "ani";
  const active = PORTALS[current];
  const ActiveIcon = active.icon;

  const onOpenChange = (open: boolean) => {
    if (!open) return;
    // Read on open, not during render — tokens live in localStorage.
    setMatching(hasMatchingSession(current, other));
    (current === "ani" ? api : supplierApi)
      .get<Membership>("/membership")
      .then((r) => setMembership(r.data))
      .catch(() => setMembership(null));
  };

  const otherStatus = !membership
    ? PORTALS[other].detail
    : !membership[other]
      ? "Not on your membership · join"
      : matching || membership.linked ? `${PORTALS[other].detail} · switch instantly` : `${PORTALS[other].detail} · sign in`;

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-foreground bg-accent hover:bg-accent/70 border border-border rounded-lg px-2.5 py-1.5 transition"
          aria-label={`Switch platform — currently ${active.name}`}
        >
          <ActiveIcon size={13} />
          <span>{active.name}</span>
          <ChevronsUpDown size={12} className="text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Switch platform</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {([current, other] as Platform[]).map((id) => {
          const p = PORTALS[id];
          const Icon = p.icon;
          const isCurrent = id === current;
          return (
            <DropdownMenuItem
              key={id}
              onClick={async () => {
                if (isCurrent) return;
                // Membership may still be loading if the item was clicked instantly.
                const m = membership ?? (await (current === "ani" ? api : supplierApi).get<Membership>("/membership").then((r) => r.data).catch(() => null));
                const next = await performSwitch(current, id, m);
                // A freshly issued session needs a full load so that platform boots with it.
                if (next.reload) window.location.assign(`/${locale}${next.reload}`);
                else if (next.navigate) router.push(next.navigate);
              }}
              className="gap-2.5"
            >
              <Icon size={16} className="text-muted-foreground shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-[11px] text-muted-foreground">{isCurrent ? p.detail : otherStatus}</div>
              </div>
              {isCurrent && <Check size={14} className="text-emerald-500" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
