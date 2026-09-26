"use client";

import { useEffect, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { Building2, Mail, Lock, Eye, EyeOff, User as UserIcon, MapPin, Globe2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MARKETS, MARKET_LABEL, type Market } from "@/lib/types";

export default function SignupPage() {
  const [orgName, setOrgName] = useState("");
  const [region, setRegion] = useState("");
  const [market, setMarket] = useState<Market>("uk");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user, booting, signup } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!booting && user) router.replace("/dashboard");
  }, [booting, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await signup({ orgName, region: region || undefined, market, name, email, password });
      toast.success("Your ANI™ workspace is ready");
      router.push("/onboarding");
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not create your account — please try again.";
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
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
              A working workspace, <span className="text-emerald-400">in minutes</span>.
            </h2>
            <p className="mt-4 text-slate-300 max-w-md">
              Register your organisation and ANI™ provisions a dedicated workspace — ready for
              real assets, live tariffs and grid carbon data from day one.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">© 2026 Davwo Energy Ltd.</div>
        </div>
      </div>

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

          <h1 className="text-3xl font-display font-semibold text-foreground">Start your pilot</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Register your organisation and get your own ANI™ workspace.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground/80">Organisation name</label>
              <div className="mt-1.5 relative">
                <Building2 size={16} className="absolute left-3 top-3.5 text-muted-foreground" />
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. Northbridge Mobility"
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground/80">Region (optional)</label>
              <div className="mt-1.5 relative">
                <MapPin size={16} className="absolute left-3 top-3.5 text-muted-foreground" />
                <Input
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. Manchester, UK"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground/80">Market</label>
              <div className="mt-1.5 relative">
                <Globe2 size={16} className="absolute left-3 top-3.5 text-muted-foreground z-10" />
                <Select value={market} onValueChange={(v) => setMarket(v as Market)}>
                  <SelectTrigger className={`${inputCls} pl-9`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MARKETS.map((m) => (
                      <SelectItem key={m} value={m}>{MARKET_LABEL[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Selects which live grid/tariff data your dashboard uses.</p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground/80">Your name</label>
              <div className="mt-1.5 relative">
                <UserIcon size={16} className="absolute left-3 top-3.5 text-muted-foreground" />
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. Ada Lovelace"
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground/80">Email</label>
              <div className="mt-1.5 relative">
                <Mail size={16} className="absolute left-3 top-3.5 text-muted-foreground" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                  placeholder="you@company.com"
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
                  className={`${inputCls} pr-10`}
                  placeholder="At least 8 characters"
                  minLength={8}
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
              {loading ? "Creating your workspace…" : "Create my workspace"} <ArrowRight size={16} />
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-emerald-600 hover:text-emerald-700">
              Sign in
            </Link>
          </div>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              ← Back to home
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full pl-9 pr-3 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-500/20 outline-none transition";
