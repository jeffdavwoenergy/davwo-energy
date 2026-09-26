"use client";

import useSWR, { mutate } from "swr";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { fetcher } from "@/lib/swr";
import { useAuth } from "@/lib/auth";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type Org = { id: string; name: string; slug: string; plan: string; region: string };

export default function OrgSwitcher() {
  const { user, switchOrg } = useAuth();
  const { data: orgs } = useSWR<Org[]>("/tenants", fetcher);
  if (!user) return null;

  const current = user.orgName || orgs?.find((o) => o.id === user.orgId)?.name || "Organisation";
  const canSwitch = (orgs?.length ?? 0) > 1;

  if (!canSwitch) {
    return (
      <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-accent border border-border rounded-lg px-2.5 py-1.5">
        <Building2 size={13} /> {current}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-foreground bg-accent hover:bg-accent/70 border border-border rounded-lg px-2.5 py-1.5 transition">
          <Building2 size={13} />
          <span className="max-w-[150px] truncate">{current}</span>
          <ChevronsUpDown size={12} className="text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Switch organisation</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {orgs!.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onClick={async () => {
              await switchOrg(o.id);
              await mutate(() => true); // revalidate all tenant-scoped data
            }}
          >
            <div className="flex-1">
              <div className="text-sm font-medium">{o.name}</div>
              <div className="text-[11px] text-muted-foreground capitalize">{o.region} · {o.plan}</div>
            </div>
            {o.id === user.orgId && <Check size={14} className="text-emerald-500" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
