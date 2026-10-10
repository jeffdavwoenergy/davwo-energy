"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Zap, Sun, BatteryCharging, Truck, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";

export type DeviceType = "ev" | "solar" | "battery" | "fleet";

export interface DeviceMeta {
  id: DeviceType;
  label: string;
  sub: string;
  icon: LucideIcon;
}

export const DEVICES: DeviceMeta[] = [
  { id: "ev", label: "EV Chargers", sub: "Charge point network", icon: Zap },
  { id: "solar", label: "Solar", sub: "PV generation & export", icon: Sun },
  { id: "battery", label: "Batteries", sub: "Storage & backup", icon: BatteryCharging },
  { id: "fleet", label: "Fleet Vehicles", sub: "EV fleet telemetry", icon: Truck },
];

interface Ctx {
  device: DeviceType;
  setDevice: (d: DeviceType) => void;
}
const DeviceContext = createContext<Ctx | null>(null);

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const key = `davwo_device_type:${user?.id ?? "anon"}`;
  const [device, setDeviceState] = useState<DeviceType>("ev");

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(key) as DeviceType | null;
      // Browser-only storage, read after mount (server render uses "ev").
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDeviceState(v && DEVICES.some((d) => d.id === v) ? v : "ev");
    } catch {
      setDeviceState("ev");
    }
  }, [key]);

  const setDevice = useCallback(
    (d: DeviceType) => {
      setDeviceState(d);
      try {
        window.localStorage.setItem(key, d);
      } catch {
        /* ignore */
      }
    },
    [key],
  );

  return <DeviceContext.Provider value={{ device, setDevice }}>{children}</DeviceContext.Provider>;
}

export function useDeviceType() {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error("useDeviceType must be used within DeviceProvider");
  return ctx;
}
