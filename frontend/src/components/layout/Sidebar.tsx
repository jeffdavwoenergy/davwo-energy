"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
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
  MapPin,
  Store,
  HelpCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

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

function initialsOf(name?: string, fallback?: string) {
  if (fallback) return fallback;
  if (!name) return "U";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function SidebarContents({
  onNavigate,
  isCollapsed = false,
  onToggleCollapse,
}: {
  onNavigate?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("sidebar");
  const role: Role = user?.role || "admin";
  const items = NAV.filter((n) => n.roles.includes(role));
  const supportActive = pathname === "/support" || pathname.startsWith("/support/");
  const unreadTickets = 1;
  const initials = initialsOf(user?.name, user?.avatar_initials);

  const signOut = () => {
    logout();
    router.push("/login");
  };

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Brand */}
      <div className={`px-5 py-6 flex items-center gap-3 ${isCollapsed ? "justify-center px-3" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/davwo-icon.png" alt="DAVWO" className="h-8 w-auto shrink-0 select-none" draggable={false} />
        {!isCollapsed && (
          <div className="min-w-0">
            <div className="font-display font-bold text-lg tracking-tight text-foreground leading-none">DAVWO</div>
            <div className="text-[11px] text-muted-foreground mt-1 truncate">{t("tagline")}</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto sidebar-scroll">
        {items.map(({ to, key, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              href={to}
              onClick={onNavigate}
              title={isCollapsed ? t(`nav.${key}`) : undefined}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all ${
                active
                  ? "bg-emerald-500 text-white font-medium shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground font-normal"
              } ${isCollapsed ? "justify-center px-2" : ""}`}
            >
              <Icon size={18} strokeWidth={1.8} className="shrink-0" />
              {!isCollapsed && <span className="truncate">{t(`nav.${key}`)}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: user + support + sign out + collapse */}
      <div className="p-3 space-y-1 border-t border-border">
        {/* User — click name to open the account popover */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title={isCollapsed ? user?.name : undefined}
              className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-accent transition ${
                isCollapsed ? "justify-center px-2" : ""
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                {initials}
              </div>
              {!isCollapsed && (
                <div className="min-w-0 text-left">
                  <div className="text-sm font-medium text-foreground truncate">{user?.name || "User"}</div>
                  <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuLabel>
              <div className="font-semibold">{user?.name}</div>
              <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {role === "admin" && (
              <DropdownMenuItem onClick={() => { onNavigate?.(); router.push("/settings"); }}>
                Account &amp; settings
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => { onNavigate?.(); router.push("/demo"); }}>
              Demo module
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600" onClick={signOut}>
              <LogOut size={14} className="mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Support (with unread badge) */}
        <Link
          href="/support"
          onClick={onNavigate}
          title={isCollapsed ? "Support" : undefined}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all ${
            supportActive
              ? "bg-emerald-500 text-white font-medium"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          } ${isCollapsed ? "justify-center px-2" : ""}`}
        >
          <span className="relative shrink-0 flex items-center justify-center">
            <HelpCircle size={18} strokeWidth={1.8} />
            {unreadTickets > 0 && (
              <span className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unreadTickets}
              </span>
            )}
          </span>
          {!isCollapsed && <span className="truncate">Support</span>}
        </Link>

        {/* Collapse toggle (desktop) */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`w-full flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground transition ${
              isCollapsed ? "justify-center px-2" : ""
            }`}
          >
            {isCollapsed ? (
              <ChevronRight size={16} className="shrink-0" />
            ) : (
              <>
                <ChevronLeft size={14} className="shrink-0" />
                <span>Collapse</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside
      className={`hidden lg:flex shrink-0 flex-col h-screen sticky top-0 transition-all duration-300 ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      <SidebarContents isCollapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
    </aside>
  );
}
