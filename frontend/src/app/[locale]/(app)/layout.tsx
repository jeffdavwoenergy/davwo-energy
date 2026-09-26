"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import Sidebar, { SidebarContents } from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import FloatingAni from "@/components/ani/FloatingAni";
import { useAuth } from "@/lib/auth";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { Role } from "@/lib/types";

const ROLE_RESTRICTIONS: Record<string, Role[]> = {
  "/settings": ["admin"],
  "/assets": ["admin", "operator"],
};

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

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-x-hidden">
          {children}
        </main>
        <footer className="px-4 sm:px-6 lg:px-8 py-4 text-xs text-muted-foreground border-t border-border flex items-center justify-between flex-wrap gap-2">
          <span>{t("copyright", { year: 2026 })}</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-soft-pulse" />
            <span className="hidden sm:inline">{t("dataRefreshes")}</span>
            <span className="sm:hidden">{t("live")}</span>
          </span>
        </footer>
      </div>

      <FloatingAni />
    </div>
  );
}
