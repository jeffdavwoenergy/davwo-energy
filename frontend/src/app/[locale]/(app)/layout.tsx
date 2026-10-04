"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import Sidebar, { SidebarContents } from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import FloatingAni from "@/components/ani/FloatingAni";
import { useAuth } from "@/lib/auth";
import { DeviceProvider } from "@/lib/deviceType";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PublicMarketplaceHeader } from "@/components/marketplace/PublicMarketplaceHeader";
import type { Role } from "@/lib/types";

const ROLE_RESTRICTIONS: Record<string, Role[]> = {
  "/settings": ["admin"],
  "/assets": ["admin", "operator"],
};

/** The marketplace catalogue and product pages are public — logged-out
 * visitors get them in the standalone public shell instead of a login
 * redirect. Enquiries and listing management stay sign-in only. */
const PRIVATE_MARKETPLACE = ["/marketplace/enquiries", "/marketplace/manage"];
function isPublicMarketplace(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean); // ["marketplace"] or ["marketplace", "<id>"]
  return parts[0] === "marketplace" && parts.length <= 2 && !PRIVATE_MARKETPLACE.includes(pathname);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, booting } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const t = useTranslations("appShell");

  // The dashboard uses a light surface (matching the reference design). Force
  // the light palette while this shell is mounted so portalled popovers/menus
  // (rendered at <body>, outside the layout tree) match too; restore the dark
  // theme on unmount (login / marketing pages keep their dark treatment).
  useEffect(() => {
    const html = document.documentElement;
    const hadDark = html.classList.contains("dark");
    html.classList.remove("dark");
    return () => {
      if (hadDark) html.classList.add("dark");
    };
  }, []);

  useEffect(() => {
    if (booting) return;
    if (!user) {
      if (isPublicMarketplace(pathname)) return;
      router.replace(`/login?from=${encodeURIComponent(pathname)}`);
      return;
    }
    for (const [path, roles] of Object.entries(ROLE_RESTRICTIONS)) {
      if (pathname.startsWith(path) && !roles.includes(user.role)) {
        router.replace("/dashboard");
        return;
      }
    }
  }, [booting, user, pathname, router]);

  if (!booting && !user && isPublicMarketplace(pathname)) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] text-slate-900">
        <PublicMarketplaceHeader />
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">{children}</main>
        <footer className="border-t border-slate-200 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
            <span>© 2026 Davwo Energy Ltd.</span>
            <span>Supplied, installed &amp; monitored by Davwo</span>
          </div>
        </footer>
      </div>
    );
  }

  if (booting || !user) {
    return (
      <div className="h-screen flex items-center justify-center text-muted-foreground">{t("loading")}</div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="p-0 w-72 max-w-[85vw] bg-card">
          <SidebarContents onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <DeviceProvider>
        <div className="flex-1 min-w-0 flex flex-col">
          <TopBar onOpenMobileNav={() => setMobileNavOpen(true)} />
          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-x-hidden">
            {children}
          </main>
          <footer className="px-4 sm:px-6 lg:px-8 py-4 text-xs text-muted-foreground flex items-center justify-between flex-wrap gap-2">
            <span>{t("copyright", { year: 2026 })}</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-soft-pulse" />
              <span className="hidden sm:inline">{t("dataRefreshes")}</span>
              <span className="sm:hidden">{t("live")}</span>
            </span>
          </footer>
        </div>
      </DeviceProvider>

      <FloatingAni />
    </div>
  );
}
