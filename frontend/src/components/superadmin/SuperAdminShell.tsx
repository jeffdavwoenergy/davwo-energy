"use client";

import { useEffect, useState } from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  LayoutDashboard, Users, Building2, Store, Package, Inbox, LogOut, ChevronLeft, ChevronRight,
  Menu, ShieldCheck, ShieldAlert, RefreshCw, type LucideIcon,
} from "lucide-react";
import { getSuperAdminToken, clearSuperAdminToken, useOverview, useSuperAdminSession } from "@/lib/superAdminApi";
import { Sheet, SheetContent } from "@/components/ui/sheet";

interface NavItem { to: string; label: string; icon: LucideIcon }

const NAV: NavItem[] = [
  { to: "/superadmin/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/superadmin/organisations", label: "Organisations", icon: Building2 },
  { to: "/superadmin/users", label: "Users", icon: Users },
];
const MARKET_NAV: NavItem[] = [
  { to: "/superadmin/suppliers", label: "Suppliers", icon: Store },
  { to: "/superadmin/marketplace", label: "Listings", icon: Package },
  { to: "/superadmin/enquiries", label: "Enquiries", icon: Inbox },
];

/** Same active-pill treatment as the pilot app and Supplier Portal sidebars. */
function NavLink({ item, active, collapsed, count, onNavigate }: {
  item: NavItem; active: boolean; collapsed: boolean; count?: number; onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.to}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={`relative overflow-hidden flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all ${
        active ? "text-white font-medium shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground font-normal"
      } ${collapsed ? "justify-center px-2" : ""}`}
    >
      {active && (
        <>
          <span className="absolute inset-0 bg-map-dark" />
          <span className="absolute inset-0 bg-grain" />
        </>
      )}
      <Icon size={18} strokeWidth={1.8} className="shrink-0 relative z-10" />
      {!collapsed && <span className="truncate relative z-10 flex-1">{item.label}</span>}
      {!collapsed && count != null && (
        <span className={`relative z-10 text-[11px] tabular-nums ${active ? "text-white/70" : "text-muted-foreground"}`}>{count}</span>
      )}
    </Link>
  );
}

function SidebarContents({ collapsed = false, onToggleCollapse, onNavigate }: {
  collapsed?: boolean; onToggleCollapse?: () => void; onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useOverview();
  const { data: session } = useSuperAdminSession();
  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");
  const counts: Record<string, number | undefined> = {
    "/superadmin/organisations": data?.stats.organisations,
    "/superadmin/users": data?.stats.users,
    "/superadmin/suppliers": data?.stats.suppliers,
    "/superadmin/marketplace": data?.stats.listings,
    "/superadmin/enquiries": data?.stats.enquiries,
  };

  const signOut = () => {
    clearSuperAdminToken();
    router.replace("/superadmin");
  };

  const section = (label: string) =>
    collapsed ? <div className="my-2 border-t border-border" /> : (
      <div className="pt-4 pb-1 px-3.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
    );

  return (
    <div className="flex flex-col h-full bg-card">
      <div className={`px-5 py-6 flex items-center gap-3 ${collapsed ? "justify-center px-3" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/davwo-icon.png" alt="DAVWO" className="h-8 w-auto shrink-0 select-none" draggable={false} />
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-display font-bold text-lg tracking-tight text-foreground leading-none">DAVWO</div>
            <div className="text-[11px] font-semibold text-amber-600 mt-1 truncate flex items-center gap-1">
              <ShieldCheck size={12} /> Super Admin
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto sidebar-scroll">
        {section("Platform")}
        {NAV.map((item) => (
          <NavLink key={item.to} item={item} active={isActive(item.to)} collapsed={collapsed} count={counts[item.to]} onNavigate={onNavigate} />
        ))}
        {section("Marketplace")}
        {MARKET_NAV.map((item) => (
          <NavLink key={item.to} item={item} active={isActive(item.to)} collapsed={collapsed} count={counts[item.to]} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="p-3 space-y-1 border-t border-border">
        <div className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${collapsed ? "justify-center px-2" : ""}`} title={session?.email}>
          <div className="relative overflow-hidden w-8 h-8 rounded-full text-white flex items-center justify-center shrink-0">
            <span className="absolute inset-0 bg-map-dark" />
            <span className="absolute inset-0 bg-grain" />
            <ShieldCheck size={15} className="relative z-10 text-amber-300" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground truncate">Platform operator</div>
              <div className="text-xs text-muted-foreground truncate">{session?.email ?? "…"}</div>
            </div>
          )}
        </div>
        <button
          onClick={signOut}
          title={collapsed ? "Sign out" : undefined}
          className={`w-full flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition ${collapsed ? "justify-center px-2" : ""}`}
        >
          <LogOut size={16} className="shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`w-full flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground transition ${collapsed ? "justify-center px-2" : ""}`}
          >
            {collapsed ? <ChevronRight size={16} className="shrink-0" /> : (<><ChevronLeft size={14} className="shrink-0" /><span>Collapse</span></>)}
          </button>
        )}
      </div>
    </div>
  );
}

/** Top bar: a permanent "you are in Super Admin" strip, so this console can
 * never be mistaken for an ordinary org admin's view of the app. */
function TopBar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { data, isValidating, mutate } = useOverview();
  return (
    <div className="sticky top-0 z-30">
      <div className="relative overflow-hidden text-white">
        <span className="absolute inset-0 bg-map-dark" />
        <span className="absolute inset-0 bg-grain" />
        <div className="relative z-10 px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-2 text-xs">
          <ShieldAlert size={14} className="text-amber-300 shrink-0" />
          <span className="font-semibold tracking-wide uppercase text-amber-300">Super Admin mode</span>
          <span className="hidden sm:inline text-slate-300">— changes here apply across every organisation and supplier on the platform.</span>
        </div>
      </div>
      <div className="bg-card px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onOpenMobileNav}
            className="lg:hidden w-9 h-9 rounded-lg hover:bg-accent flex items-center justify-center text-foreground"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm text-muted-foreground truncate">
            Platform data {data ? `refreshed ${new Date(data.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "loading…"}
          </span>
        </div>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 rounded-full px-3 h-9 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Refresh platform data"
        >
          <RefreshCw size={15} className={isValidating ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>
    </div>
  );
}

export default function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!getSuperAdminToken()) {
      router.replace("/superadmin");
      return;
    }
    // sessionStorage is browser-only — same post-mount auth check as SupplierShell.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, [router]);

  // Light palette while mounted, matching the pilot app and Supplier Portal shells.
  useEffect(() => {
    const html = document.documentElement;
    const hadDark = html.classList.contains("dark");
    html.classList.remove("dark");
    return () => {
      if (hadDark) html.classList.add("dark");
    };
  }, []);

  if (!ready) return <div className="h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen bg-background flex">
      <aside className={`hidden lg:flex shrink-0 flex-col h-screen sticky top-0 transition-all duration-300 ${collapsed ? "w-20" : "w-64"}`}>
        <SidebarContents collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="p-0 w-72 max-w-[85vw] bg-card">
          <SidebarContents onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-x-hidden">{children}</main>
        <footer className="px-4 sm:px-6 lg:px-8 py-4 text-xs text-muted-foreground">© 2026 Davwo Energy Ltd. · Super Admin console — restricted access</footer>
      </div>
    </div>
  );
}
