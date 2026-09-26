"use client";

import { Bell, HelpCircle, ChevronDown, LogOut, Menu, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import api from "@/lib/api";
import { fetcher } from "@/lib/swr";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/shared/Logo";
import OrgSwitcher from "@/components/layout/OrgSwitcher";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Notification { id: string; severity: "high" | "medium" | "low"; status: string; title: string; detail: string; at: string; }
const SEV_DOT = { high: "bg-red-500", medium: "bg-amber-500", low: "bg-sky-500" } as const;

// Module-level (not a component-body closure) so the impure Date.now() call
// isn't reachable from a memoizable render closure — the actual formatting
// (which needs the translator) happens at the call site instead.
function minutesSince(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

export default function TopBar({ onOpenMobileNav }: { onOpenMobileNav?: () => void }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const t = useTranslations("topBar");
  const { data: notif } = useSWR<{ items: Notification[]; unread: number }>(
    "/notifications", fetcher, { refreshInterval: 60000 },
  );
  const unread = notif?.unread ?? 0;
  const items = notif?.items ?? [];

  const emailDigest = async () => {
    try {
      const { data } = await api.post<{ sent: boolean; reason?: string }>("/notifications/email");
      if (data.sent) toast.success(t("digestEmailed"));
      else toast.message(data.reason ?? t("emailNotConfigured"));
    } catch {
      toast.error(t("digestFailed"));
    }
  };

  const initials =
    user?.avatar_initials ||
    (user?.name
      ? user.name
          .split(" ")
          .map((p) => p[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()
      : "U");

  return (
    <div className="bg-background/80 backdrop-blur sticky top-0 z-30 border-b border-border px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 lg:flex-1">
        <button
          onClick={onOpenMobileNav}
          className="lg:hidden w-9 h-9 rounded-lg hover:bg-accent flex items-center justify-center text-foreground"
          aria-label={t("openMenu")}
        >
          <Menu size={20} />
        </button>
        <div className="lg:hidden">
          <Logo compact />
        </div>
        <OrgSwitcher />
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3">
        <LanguageSwitcher />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="relative w-9 h-9 rounded-full hover:bg-accent flex items-center justify-center text-muted-foreground"
              aria-label={unread ? t("notificationsUnread", { count: unread }) : t("notifications")}
            >
              <Bell size={18} />
              {unread > 0 && (
                <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] rounded-full min-w-4 h-4 px-1 flex items-center justify-center">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>{t("notifications")}</span>
              {unread > 0 && <span className="text-xs font-normal text-muted-foreground">{t("unreadCount", { count: unread })}</span>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {items.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">{t("allCaughtUp")}</div>
            ) : (
              items.slice(0, 6).map((n) => {
                const mins = minutesSince(n.at);
                const ago = mins < 60 ? t("minutesAgo", { count: mins }) : t("hoursAgo", { count: Math.round(mins / 60) });
                return (
                  <DropdownMenuItem key={n.id} onClick={() => router.push("/alerts")} className="items-start gap-2 py-2">
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SEV_DOT[n.severity]}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground truncate">{n.title}</span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {n.detail} · {ago}{n.status === "acknowledged" ? ` · ${t("acknowledged")}` : ""}
                      </span>
                    </span>
                  </DropdownMenuItem>
                );
              })
            )}
            <DropdownMenuSeparator />
            {items.length > 0 && (
              <DropdownMenuItem onClick={emailDigest} className="gap-2 text-sm text-muted-foreground">
                <Mail size={14} /> {t("emailDigest")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => router.push("/alerts")} className="justify-center text-sm font-semibold text-emerald-600">
              {t("viewAllAlerts")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          className="hidden sm:flex w-9 h-9 rounded-full hover:bg-accent items-center justify-center text-muted-foreground"
          aria-label={t("help")}
        >
          <HelpCircle size={18} />
        </button>
      </div>
    </div>
  );
}
