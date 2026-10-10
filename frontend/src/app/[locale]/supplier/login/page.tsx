"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, LogIn, UserCog, Building2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import supplierApi, { setSupplierToken } from "@/lib/supplierApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AuthImagePanel from "@/components/shared/AuthImagePanel";
import { linkSessionsIfSameEmail } from "@/lib/portalSwitch";

/** Seeded demo supplier accounts (suppliers.ts DEMO_SUPPLIERS) — the same two
 * admins as the ANI™ login's demo cards, so each can switch between platforms. */
const DEMO_ACCOUNTS: { account: string; company: string; icon: typeof UserCog; tone: string }[] = [
  { account: "s-davwo", company: "Davwo Energy", icon: UserCog, tone: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" },
  { account: "s-acme", company: "Acme Corp", icon: Building2, tone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" },
];

type SupplierAuthResponse = { token: string; supplier: { companyName: string } };

// A copy of the ANI™ sign-in (same split layout, form and demo cards), for the Supplier Portal.
function SupplierLoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  // ?email= comes from the ANI™ platform switcher — leave the password blank then.
  const switchEmail = sp.get("email");
  const [email, setEmail] = useState(switchEmail ?? "admin@davwo.com");
  const [password, setPassword] = useState(switchEmail ? "" : "Demo@123");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  const signedIn = async (data: SupplierAuthResponse) => {
    setSupplierToken(data.token);
    await linkSessionsIfSameEmail();
    toast.success(`Welcome back, ${data.supplier.companyName}`);
    router.push("/supplier/dashboard");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await supplierApi.post<SupplierAuthResponse>("/supplier/auth/login", { email, password });
      await signedIn(data);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  const quickAccount = async (account: string) => {
    setLoading(true);
    try {
      const { data } = await supplierApi.post<SupplierAuthResponse>(`/supplier/auth/demo-login?account=${account}`);
      await signedIn(data);
    } catch (err: unknown) {
      // Surface the server reason (e.g. "Demo login is disabled" when ALLOW_DEMO_LOGIN is off).
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ? `Demo sign-in failed: ${detail}` : "Demo sign-in is unavailable right now. Please use your email and password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <AuthImagePanel
        image="/landing/fleet_commercial_truck_charging_1790536590056.jpg"
        alt="Commercial vehicle charging"
        badge={
          <span className="ml-1 text-xs font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-400/30 rounded-full px-2 py-0.5">
            Supplier Portal
          </span>
        }
        headline={<>Sell your energy hardware on the <span className="text-emerald-400">Davwo Marketplace</span>.</>}
        subcopy="List your chargers, batteries, solar and energy services with your own plan pricing, and answer enquiries from buyers ready to order."
        footer="© 2026 Davwo Energy Ltd."
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
          </div>

          <h1 className="text-3xl font-display font-semibold text-foreground">Sign in</h1>
          <p className="text-muted-foreground mt-1 text-sm">Access your Supplier Portal — listings, enquiries and analytics.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground/80">Email</label>
              <div className="mt-1.5 relative">
                <Mail size={16} className="absolute left-3 top-3.5 text-muted-foreground" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 pr-3 py-3 h-auto rounded-xl"
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground/80">Password</label>
              <div className="mt-1.5 relative">
                <Lock size={16} className="absolute left-3 top-3.5 text-muted-foreground" />
                <Input
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
              <LogIn size={18} /> {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            New supplier?{" "}
            <Link href="/supplier/signup" className="font-semibold text-emerald-600 hover:text-emerald-700">
              Register your company
            </Link>
          </div>

          <div className="mt-8">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Or try a demo role</div>
            <div className="mt-3 space-y-2">
              {DEMO_ACCOUNTS.map(({ account, company, icon: Icon, tone }) => (
                <Button
                  key={account}
                  variant="outline"
                  onClick={() => quickAccount(account)}
                  disabled={loading}
                  className="h-auto w-full justify-start gap-3 p-3 text-left font-normal hover:bg-emerald-50/40 dark:hover:bg-emerald-500/10 hover:border-emerald-300 dark:hover:border-emerald-500/40"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">Admin · {company}</div>
                    <div className="text-xs font-normal text-muted-foreground">Full access to listings, enquiries and analytics.</div>
                  </div>
                  <ArrowRight size={16} className="text-muted-foreground shrink-0" />
                </Button>
              ))}
            </div>
          </div>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">← Back to home</Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function SupplierLoginPage() {
  return (
    <Suspense>
      <SupplierLoginInner />
    </Suspense>
  );
}
