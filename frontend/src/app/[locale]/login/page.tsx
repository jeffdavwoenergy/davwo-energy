"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, LogIn, UserCog, Building2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AuthImagePanel from "@/components/shared/AuthImagePanel";
import { linkSessionsIfSameEmail } from "@/lib/portalSwitch";

/** Seeded demo accounts (users.ts DEMO_USERS) offered as one-click sign-ins —
 * both admins, at different companies, each with Full membership. */
const DEMO_ACCOUNTS: { account: string; role: Role; company: string; icon: typeof UserCog; tone: string }[] = [
  { account: "u-admin", role: "admin", company: "Davwo Energy", icon: UserCog, tone: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" },
  { account: "u-acme-admin", role: "admin", company: "Acme Corp", icon: Building2, tone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" },
];

function LoginInner() {
  const t = useTranslations("login");
  const sp = useSearchParams();
  // ?switch=1 comes from the Supplier Portal's platform switcher: don't
  // auto-redirect into whoever is already signed in to ANI™ here — the
  // person switching may be a different account.
  const switching = sp.get("switch") === "1";
  const [email, setEmail] = useState(sp.get("email") || "admin@davwo.com");
  const [password, setPassword] = useState(switching ? "" : "Demo@123");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user, booting, login, demoLogin } = useAuth();
  const router = useRouter();
  const next = sp.get("from") || "/dashboard";

  useEffect(() => {
    if (!booting && user && !switching) router.replace(next);
  }, [booting, user, next, router, switching]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      await linkSessionsIfSameEmail();
      toast.success(t("welcomeBack"));
      router.push(next);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || t("invalidCredentials"));
    } finally {
      setLoading(false);
    }
  };

  const quickAccount = async ({ account, role, company }: (typeof DEMO_ACCOUNTS)[number]) => {
    setLoading(true);
    try {
      await demoLogin(account);
      await linkSessionsIfSameEmail();
      toast.success(t("signedInAs", { role: `${t(`roles.${role}.label`)} · ${company}` }));
      router.push("/dashboard");
    } catch (err: unknown) {
      // Surface the server reason (e.g. "Demo login is disabled" when ALLOW_DEMO_LOGIN is off).
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ? `${t("demoLoginFailed")}: ${detail}` : t("demoLoginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <AuthImagePanel
        image="/landing/clean_energy_grid_hero_1790540262882.jpg"
        alt="Clean energy grid"
        headline={t.rich("brandHeadline", { highlight: (chunks) => <span className="text-emerald-400">{chunks}</span> })}
        subcopy={t("brandSubcopy")}
        footer={t("copyright", { year: 2026 })}
      />

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-10 bg-background">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden flex items-center gap-2 mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/davwo-icon-white.png" alt="DAVWO" className="h-9 w-auto" />
            <span className="font-display font-bold text-2xl text-[hsl(var(--primary))]">DAVWO</span>
          </div>

          <h1 className="text-3xl font-display font-semibold text-foreground">{t("signIn")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
          {switching && user && user.email !== email.toLowerCase().trim() && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              This browser is signed in to ANI™ as <strong>{user.email}</strong>. Sign in below to switch to your own account.
            </div>
          )}

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground/80">{t("email")}</label>
              <div className="mt-1.5 relative">
                <Mail size={16} className="absolute left-3 top-3.5 text-muted-foreground" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 pr-3 py-3 h-auto rounded-xl"
                  placeholder={t("emailPlaceholder")}
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground/80">{t("password")}</label>
              <div className="mt-1.5 relative">
                <Lock size={16} className="absolute left-3 top-3.5 text-muted-foreground" />
                <Input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-10 py-3 h-auto rounded-xl"
                  placeholder="••••••••"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute right-1 top-1 h-8 w-8 text-muted-foreground hover:bg-transparent hover:text-foreground"
                  aria-label={showPwd ? t("hidePassword") : t("showPassword")}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full gap-2 py-3 h-auto">
              <LogIn size={18} /> {loading ? t("signingIn") : t("signIn")}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            {t("newToDavwo")}{" "}
            <Link href="/signup" className="font-semibold text-emerald-600 hover:text-emerald-700">
              {t("startYourPilot")}
            </Link>
          </div>

          <div className="mt-8">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              {t("orTryDemo")}
            </div>
            <div className="mt-3 space-y-2">
              {DEMO_ACCOUNTS.map((demo) => {
                const { account, role, company, icon: Icon, tone } = demo;
                return (
                <Button
                  key={account}
                  variant="outline"
                  onClick={() => quickAccount(demo)}
                  disabled={loading}
                  className="h-auto w-full justify-start gap-3 p-3 text-left font-normal hover:bg-emerald-50/40 dark:hover:bg-emerald-500/10 hover:border-emerald-300 dark:hover:border-emerald-500/40"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">{t(`roles.${role}.label`)} · {company}</div>
                    <div className="text-xs font-normal text-muted-foreground">{t(`roles.${role}.description`)}</div>
                  </div>
                  <ArrowRight size={16} className="text-muted-foreground shrink-0" />
                </Button>
                );
              })}
            </div>
          </div>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              {t("backToHome")}
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const t = useTranslations("login");
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">{t("loading")}</div>}>
      <LoginInner />
    </Suspense>
  );
}
