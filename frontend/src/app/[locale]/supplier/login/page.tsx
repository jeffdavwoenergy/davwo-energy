"use client";

import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { Mail, Lock, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import supplierApi, { setSupplierToken } from "@/lib/supplierApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const inputCls =
  "w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-500/20 outline-none transition";

export default function SupplierLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await supplierApi.post("/supplier/auth/login", { email, password });
      setSupplierToken(data.token);
      toast.success(`Welcome back, ${data.supplier.companyName}`);
      router.push("/supplier/dashboard");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm bg-card text-card-foreground rounded-2xl shadow-xl p-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-muted-foreground mb-4">
          Davwo Supplier Portal
        </div>
        <h1 className="text-2xl font-display font-bold text-foreground">Supplier sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your product listings and enquiries.</p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <div className="mt-1 relative">
              <Mail size={15} className="absolute left-3 top-3 text-muted-foreground" />
              <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Password</label>
            <div className="mt-1 relative">
              <Lock size={15} className="absolute left-3 top-3 text-muted-foreground" />
              <Input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
            </div>
          </div>
          <Button type="submit" disabled={loading} variant="secondary" className="w-full gap-2 py-2.5 h-auto">
            {loading ? "Signing in…" : "Sign in"} <ArrowRight size={15} />
          </Button>
        </form>

        <div className="mt-5 text-center text-sm text-muted-foreground">
          New supplier?{" "}
          <Link href="/supplier/signup" className="font-semibold text-foreground hover:underline">Register your company</Link>
        </div>
        <div className="mt-3 text-center text-xs text-muted-foreground">
          <Link href="/products" className="hover:text-foreground">← Back to product search</Link>
        </div>
      </div>
    </div>
  );
}
