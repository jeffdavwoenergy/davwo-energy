"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import {
  LayoutDashboard,
  Activity,
  LineChart,
  TrendingUp,
  Bell,
  Boxes,
  FileText,
  MessageCircle,
  Settings as SettingsIcon,
  Compass,
  ShieldCheck,
  MapPin,
  Store,
  type LucideIcon,
} from "lucide-react";
import Logo from "@/components/shared/Logo";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

interface NavItem {
  to: string;
  key: string;
  icon: LucideIcon;
  roles: Role[];
}

const ALL: Role[] = ["admin", "operator", "pilot"];

const NAV: NavItem[] = [
  { to: "/dashboard", key: "dashboard", icon: LayoutDashboard, roles: ALL },
  { to: "/monitoring", key: "monitoring", icon: Activity, roles: ALL },
  { to: "/map", key: "map", icon: MapPin, roles: ALL },
  { to: "/analytics", key: "analytics", icon: LineChart, roles: ALL },
  { to: "/forecasting", key: "forecasting", icon: TrendingUp, roles: ALL },
  { to: "/alerts", key: "alerts", icon: Bell, roles: ALL },
  { to: "/assets", key: "assets", icon: Boxes, roles: ["admin", "operator"] },
  { to: "/marketplace", key: "marketplace", icon: Store, roles: ALL },
  { to: "/reports", key: "reports", icon: FileText, roles: ALL },
  { to: "/ai-assistant", key: "askAni", icon: MessageCircle, roles: ALL },
  { to: "/demo", key: "demo", icon: Compass, roles: ALL },
  { to: "/settings", key: "settings", icon: SettingsIcon, roles: ["admin"] },
];

export function SidebarContents({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const t = useTranslations("sidebar");
  const role: Role = user?.role || "admin";
  const items = NAV.filter((n) => n.roles.includes(role));

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="px-6 py-6 border-b border-border">
        <Logo />
        <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
          {t("tagline")}
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto sidebar-scroll">
        {items.map(({ to, key, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              href={to}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon size={18} strokeWidth={1.75} />
              <span>{t(`nav.${key}`)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-border">
        <div className="bg-secondary text-secondary-foreground rounded-2xl p-4 relative overflow-hidden">
          <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold flex items-center gap-2">
            <ShieldCheck size={14} />
            {t("platformStatus")}
          </div>
          <div className="text-sm font-semibold mt-2">{t("allSystemsOperational")}</div>
          <div className="mt-3 space-y-1.5 text-[11px] text-slate-300">
            <div className="flex justify-between">
              <span>{t("systemUptime")}</span>
              <span className="text-secondary-foreground">99.9%</span>
            </div>
            <div className="flex justify-between">
              <span>{t("dataSync")}</span>
              <span className="text-emerald-400">{t("healthy")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  return (
    <aside className="hidden lg:flex w-64 shrink-0 border-r border-border flex-col h-screen sticky top-0">
      <SidebarContents />
    </aside>
  );
}
