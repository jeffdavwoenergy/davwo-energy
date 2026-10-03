"use client";

import { ChevronsUpDown, Check } from "lucide-react";
import { DEVICES, useDeviceType } from "@/lib/deviceType";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export default function DeviceSwitcher() {
  const { device, setDevice } = useDeviceType();
  const current = DEVICES.find((d) => d.id === device) ?? DEVICES[0];
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="device-switcher"
          className="flex items-center gap-1.5 text-xs font-medium text-foreground bg-accent hover:bg-accent/70 border border-border rounded-lg px-2.5 py-1.5 transition"
        >
          <CurrentIcon size={13} className="text-emerald-600" />
          <span className="max-w-[120px] sm:max-w-[150px] truncate">{current.label}</span>
          <ChevronsUpDown size={12} className="text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Switch energy device</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {DEVICES.map((d) => {
          const Icon = d.icon;
          return (
            <DropdownMenuItem
              key={d.id}
              data-testid={`device-option-${d.id}`}
              onClick={() => setDevice(d.id)}
              className="gap-2.5"
            >
              <Icon size={15} className="text-muted-foreground shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-medium">{d.label}</div>
                <div className="text-[11px] text-muted-foreground">{d.sub}</div>
              </div>
              {d.id === device && <Check size={14} className="text-emerald-500" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
