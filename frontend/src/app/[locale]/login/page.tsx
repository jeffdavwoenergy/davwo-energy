"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, LogIn, UserCog, UserCheck, User, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ROLE_META: { role: Role; icon: typeof UserCog; tone: string }[] = [
  { role: "admin", icon: UserCog, tone: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" },
  { role: "operator", icon: UserCheck, tone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" },
  { role: "pilot", icon: User, tone: "bg-purple-100 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300" },
];

function LoginInner() {
  const t = useTranslations("login");
  const [email, setEmail] = useState("admin@davwo.com");
  const [password, setPassword] = useState("Demo@123");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user, booting, login, demoLogin } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("from") || "/dashboard";

  useEffect(() => {
    if (!booting && user) router.replace(next);
  }, [booting, user, next, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success(t("welcomeBack"));
      router.push(next);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || t("invalidCredentials"));
    } finally {
      setLoading(false);
    }
  };

  const quickRole = async (role: Role) => {
    setLoading(true);
    try {
      await demoLogin(role);
      toast.success(t("signedInAs", { role: t(`roles.${role}.label`) }));
      router.push("/dashboard");
    } catch {
      toast.error(t("demoLoginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden lg:flex relative bg-navy text-white overflow-hidden">
        <div className="absolute inset-0 bg-map-dark opacity-90" />
        <div className="absolute inset-0 bg-grain" />
        <div className="relative z-10 flex flex-col justify-between p-12">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/davwo-icon-white.png" alt="DAVWO" className="h-9 w-auto" />
            <span className="font-display font-bold text-2xl">DAVWO</span>
          </div>
          <div>
            <h2 className="text-4xl font-display font-bold leading-tight max-w-md">
              {t.rich("brandHeadline", { highlight: (chunks) => <span className="text-emerald-400">{chunks}</span> })}
            </h2>
            <p className="mt-4 text-slate-300 max-w-md">{t("brandSubcopy")}</p>
          </div>
          <div className="text-xs text-muted-foreground">{t("copyright", { year: 2026 })}</div>
        </div>
      </div>

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
              {ROLE_META.map(({ role, icon: Icon, tone }) => (
                <Button
                  key={role}
                  variant="outline"
                  onClick={() => quickRole(role)}
                  disabled={loading}
                  className="h-auto w-full justify-start gap-3 p-3 text-left font-normal hover:bg-emerald-50/40 dark:hover:bg-emerald-500/10 hover:border-emerald-300 dark:hover:border-emerald-500/40"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">{t(`roles.${role}.label`)}</div>
                    <div className="text-xs font-normal text-muted-foreground">{t(`roles.${role}.description`)}</div>
                  </div>
                  <ArrowRight size={16} className="text-muted-foreground shrink-0" />
                </Button>
              ))}
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
