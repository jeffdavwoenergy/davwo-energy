"use client";

import { useEffect, useState } from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  LayoutDashboard, Package, Inbox, LineChart, Users, Settings as SettingsIcon,
  Store, LogOut, ChevronLeft, ChevronRight, Menu, BadgeCheck, HelpCircle, type LucideIcon,
} from "lucide-react";
import { getSupplierToken, clearSupplierToken } from "@/lib/supplierApi";
import { useSupplierAccount, useSupplierLeads } from "@/lib/supplierPortal";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";
import PortalSwitcher from "@/components/layout/PortalSwitcher";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface NavItem { to: string; label: string; icon: LucideIcon }

const NAV: NavItem[] = [
  { to: "/supplier/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/supplier/listings", label: "Listings", icon: Package },
  { to: "/supplier/enquiries", label: "Enquiries", icon: Inbox },
  { to: "/supplier/analytics", label: "Analytics", icon: LineChart },
  { to: "/supplier/marketplace", label: "Marketplace", icon: Store },
];
const ACCOUNT_NAV: NavItem[] = [
  { to: "/supplier/team", label: "Team", icon: Users },
  { to: "/supplier/settings", label: "Settings", icon: SettingsIcon },
];

function initialsOf(name?: string) {
  if (!name) return "S";
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

/** Same active-pill treatment as the pilot app's Sidebar. */
function NavLink({ item, active, collapsed, badge, onNavigate }: {
  item: NavItem; active: boolean; collapsed: boolean; badge?: number; onNavigate?: () => void;
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
      {!collapsed && badge ? (
        <span className="relative z-10 min-w-5 h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[11px] font-semibold flex items-center justify-center">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function SupplierSidebarContents({ collapsed = false, onToggleCollapse, onNavigate }: {
  collapsed?: boolean; onToggleCollapse?: () => void; onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: supplier } = useSupplierAccount();
  const { leads } = useSupplierLeads();
  const newLeads = leads?.filter((l) => l.status === "new").length ?? 0;
  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  const signOut = () => {
    clearSupplierToken();
    router.push("/supplier/login");
  };

  return (
    <div className="flex flex-col h-full bg-card">
      <div className={`px-5 py-6 flex items-center gap-3 ${collapsed ? "justify-center px-3" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/davwo-icon.png" alt="DAVWO" className="h-8 w-auto shrink-0 select-none" draggable={false} />
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-display font-bold text-lg tracking-tight text-foreground leading-none">DAVWO</div>
            <div className="text-[11px] text-muted-foreground mt-1 truncate">Supplier Portal</div>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto sidebar-scroll">
        {NAV.map((item) => (
          <NavLink key={item.to} item={item} active={isActive(item.to)} collapsed={collapsed} onNavigate={onNavigate}
            badge={item.to === "/supplier/enquiries" ? newLeads : undefined} />
        ))}
        {collapsed ? (
          <div className="my-2 border-t border-border" />
        ) : (
          <div className="pt-4 pb-1 px-3.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Account</div>
        )}
        {ACCOUNT_NAV.map((item) => (
          <NavLink key={item.to} item={item} active={isActive(item.to)} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="p-3 space-y-1 border-t border-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title={collapsed ? supplier?.companyName : undefined}
              className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-accent transition ${collapsed ? "justify-center px-2" : ""}`}
            >
              <div className="relative overflow-hidden w-8 h-8 rounded-full text-white text-xs font-semibold flex items-center justify-center shrink-0">
                <span className="absolute inset-0 bg-map-dark" />
                <span className="absolute inset-0 bg-grain" />
                <span className="relative z-10">{initialsOf(supplier?.companyName)}</span>
              </div>
              {!collapsed && (
                <div className="min-w-0 text-left">
                  <div className="text-sm font-medium text-foreground truncate flex items-center gap-1">
                    <span className="truncate">{supplier?.companyName ?? "…"}</span>
                    {supplier?.verified && <BadgeCheck size={14} className="text-emerald-600 shrink-0" />}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{supplier?.email}</div>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuLabel>
              <div className="font-semibold">{supplier?.companyName}</div>
              <div className="text-xs text-muted-foreground truncate">{supplier?.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { onNavigate?.(); router.push("/supplier/settings"); }}>Company settings</DropdownMenuItem>
            <DropdownMenuItem onClick={() => { onNavigate?.(); router.push("/supplier/marketplace"); }}>View the marketplace</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600" onClick={signOut}>
              <LogOut size={14} className="mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

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

/** Top bar matching the pilot app's TopBar — language switcher on the right,
 * but the bell is replaced by an enquiries inbox (the supplier's equivalent
 * of notifications), badged with enquiries still waiting for a reply. */
function SupplierTopBar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const router = useRouter();
  const { leads } = useSupplierLeads();
  const waiting = leads?.filter((l) => l.status === "new") ?? [];

  return (
    <div className="bg-card sticky top-0 z-30 px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 lg:flex-1 min-w-0">
        <button
          onClick={onOpenMobileNav}
          className="lg:hidden w-9 h-9 rounded-lg hover:bg-accent flex items-center justify-center text-foreground"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <div className="lg:hidden flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/davwo-icon.png" alt="DAVWO" className="h-8 w-auto select-none" draggable={false} />
        </div>
        <PortalSwitcher current="supplier" />
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3">
        <LanguageSwitcher />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="relative w-9 h-9 rounded-full hover:bg-accent flex items-center justify-center text-muted-foreground"
              aria-label={waiting.length ? `Enquiries, ${waiting.length} waiting for a reply` : "Enquiries"}
            >
              <Inbox size={18} />
              {waiting.length > 0 && (
                <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] rounded-full min-w-4 h-4 px-1 flex items-center justify-center">
                  {waiting.length > 9 ? "9+" : waiting.length}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Enquiries</span>
              {waiting.length > 0 && <span className="text-xs font-normal text-muted-foreground">{waiting.length} waiting for a reply</span>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {waiting.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</div>
            ) : (
              waiting.slice(0, 6).map((l) => (
                <DropdownMenuItem key={l.id} onClick={() => router.push("/supplier/enquiries")} className="items-start gap-2 py-2">
                  <span className="mt-1.5 w-2 h-2 rounded-full shrink-0 bg-sky-500" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground truncate">{l.name}</span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {l.message} · {new Date(l.createdAt).toLocaleDateString("en-GB")}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/supplier/enquiries")} className="justify-center text-sm font-semibold text-emerald-600">
              View all enquiries
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <a
          href="mailto:support@davwo.com"
          className="hidden sm:flex w-9 h-9 rounded-full hover:bg-accent items-center justify-center text-muted-foreground"
          aria-label="Help"
          title="Contact Davwo support"
        >
          <HelpCircle size={18} />
        </a>
      </div>
    </div>
  );
}

/**
 * The supplier portal's app shell — same look as the pilot app (light
 * surface, Davwo mark, sidebar with the dark map-texture active pill), but
 * its own nav and its own supplier session (see supplierApi.ts).
 */
export default function SupplierShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!getSupplierToken()) {
      router.replace("/supplier/login");
      return;
    }
    // localStorage is browser-only, so the auth check has to happen after
    // mount (ready starts false to match the server render), same pattern
    // as the pilot app's auth refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, [router]);

  // Light palette while the portal is mounted, matching the pilot app shell.
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
        <SupplierSidebarContents collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="p-0 w-72 max-w-[85vw] bg-card">
          <SupplierSidebarContents onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 min-w-0 flex flex-col">
        <SupplierTopBar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-x-hidden">{children}</main>
        <footer className="px-4 sm:px-6 lg:px-8 py-4 text-xs text-muted-foreground">© 2026 Davwo Energy Ltd. · Supplier Portal</footer>
      </div>
    </div>
  );
}
