"use client";

import { useEffect, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, ShieldCheck, ShieldAlert, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import superAdminApi, { apiError, getSuperAdminToken, setSuperAdminToken } from "@/lib/superAdminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AuthImagePanel from "@/components/shared/AuthImagePanel";

/** One-click local sign-in with the built-in development credential
 * (src/lib/server/superadmin.ts). Next.js inlines NODE_ENV at build time, so
 * in a production build this is `null` and the credential never ships. It
 * would be refused there anyway: production only accepts SUPERADMIN_EMAIL /
 * SUPERADMIN_PASSWORD from the environment. */
const DEV_QUICK_LOGIN =
  process.env.NODE_ENV !== "production" ? { email: "superadmin@davwo.com", password: "SuperAdmin@123" } : null;

/** The super admin sign-in — same split layout as the ANI™ and Supplier
 * sign-ins, but no sign-up and no demo shortcut in production: the only
 * credential there is the one set in the deployment's environment. */
export default function SuperAdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  // Already signed in this tab — straight to the console.
  useEffect(() => {
    if (getSuperAdminToken()) router.replace("/superadmin/overview");
  }, [router]);

  const signIn = async (creds: { email: string; password: string }) => {
    setLoading(true);
    try {
      const { data } = await superAdminApi.post<{ token: string }>("/superadmin/auth/login", creds);
      setSuperAdminToken(data.token);
      toast.success("Signed in to the Super Admin console");
      router.push("/superadmin/overview");
    } catch (err) {
      toast.error(apiError(err, "Invalid super admin credentials."));
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    signIn({ email, password });
  };

  /** Fills the form (so it's visible what was used) and signs straight in. */
  const quickSignIn = () => {
    if (!DEV_QUICK_LOGIN) return;
    setEmail(DEV_QUICK_LOGIN.email);
    setPassword(DEV_QUICK_LOGIN.password);
    signIn(DEV_QUICK_LOGIN);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <AuthImagePanel
        image="/landing/clean_energy_grid_hero_1790540262882.jpg"
        alt="Clean energy grid"
        badge={
          <span className="ml-1 text-xs font-semibold text-amber-300 bg-amber-500/15 border border-amber-400/30 rounded-full px-2 py-0.5 flex items-center gap-1">
            <ShieldCheck size={12} /> Super Admin
          </span>
        }
        headline={<>Oversee the whole <span className="text-emerald-400">Davwo platform</span> from one place.</>}
        subcopy="Every organisation, user, supplier and marketplace listing — with the controls to manage them."
        footer="© 2026 Davwo Energy Ltd. · Restricted to Davwo platform operators."
      />

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
            <span className="text-xs font-semibold text-amber-500 bg-amber-500/15 border border-amber-400/30 rounded-full px-2 py-0.5">Super Admin</span>
          </div>

          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center mb-5">
            <ShieldCheck size={24} />
          </div>
          <h1 className="text-3xl font-display font-semibold text-foreground">Super Admin sign in</h1>
          <p className="text-muted-foreground mt-1 text-sm">Platform-wide access to every organisation, user and supplier.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="sa-email" className="text-sm font-medium text-foreground/80">Email</label>
              <div className="mt-1.5 relative">
                <Mail size={16} className="absolute left-3 top-3.5 text-muted-foreground" />
                <Input
                  id="sa-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 pr-3 py-3 h-auto rounded-xl"
                  placeholder="superadmin@davwo.com"
                  autoComplete="username"
                  required
                />
              </div>
            </div>
            <div>
              <label htmlFor="sa-password" className="text-sm font-medium text-foreground/80">Password</label>
              <div className="mt-1.5 relative">
                <Lock size={16} className="absolute left-3 top-3.5 text-muted-foreground" />
                <Input
                  id="sa-password"
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-10 py-3 h-auto rounded-xl"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute right-1 top-1 h-8 w-8 text-muted-foreground hover:bg-transparent hover:text-foreground"
                  aria-label={showPwd ? "Hide password" : "Show password"}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full gap-2 py-3 h-auto">
              <ShieldCheck size={18} /> {loading ? "Signing in…" : "Sign in to Super Admin"}
            </Button>
          </form>

          {DEV_QUICK_LOGIN && (
            <div className="mt-8">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Local development</div>
              <Button
                variant="outline"
                onClick={quickSignIn}
                disabled={loading}
                className="mt-3 h-auto w-full justify-start gap-3 p-3 text-left font-normal hover:bg-amber-50/50 dark:hover:bg-amber-500/10 hover:border-amber-300 dark:hover:border-amber-500/40"
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
                  <ShieldCheck size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">Super Admin · Davwo Energy</div>
                  <div className="text-xs font-normal text-muted-foreground">{DEV_QUICK_LOGIN.email}. Only on local dev servers.</div>
                </div>
                <ArrowRight size={16} className="text-muted-foreground shrink-0" />
              </Button>
            </div>
          )}

          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-xs text-amber-700 dark:text-amber-300">
            <ShieldAlert size={16} className="shrink-0 mt-0.5" />
            <span>
              Restricted area. Sign-in attempts are rate limited, and the session ends when you close this tab or after 4 hours.
            </span>
          </div>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">← Back to home</Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
