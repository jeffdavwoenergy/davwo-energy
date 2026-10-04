"use client";

import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { Building2, Mail, Lock, Globe, MapPin, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import supplierApi, { setSupplierToken } from "@/lib/supplierApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORIES = [
  { id: "ev-chargers", label: "EV Chargers" },
  { id: "battery", label: "Battery Solutions" },
  { id: "solar", label: "Solar Solutions" },
  { id: "energy-services", label: "Energy Services" },
  { id: "consulting", label: "Consulting Services" },
];

const inputCls =
  "w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-500/20 outline-none transition";

export default function SupplierSignupPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const { data } = await supplierApi.post("/supplier/auth/signup", {
        companyName, category, email, password,
        region: region || undefined, website: website || undefined,
      });
      setSupplierToken(data.token);
      toast.success("Supplier account created");
      router.push("/supplier/dashboard");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Could not create your supplier account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md bg-card text-card-foreground rounded-2xl shadow-xl p-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-muted-foreground mb-4">
          Davwo Supplier Portal
        </div>
        <h1 className="text-2xl font-display font-bold text-foreground">List your products</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Register your company to add products to the Davwo marketplace and reach buyers directly.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Company name</label>
            <div className="mt-1 relative">
              <Building2 size={15} className="absolute left-3 top-3 text-muted-foreground" />
              <Input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <Select required value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Region (optional)</label>
              <div className="mt-1 relative">
                <MapPin size={15} className="absolute left-3 top-3 text-muted-foreground" />
                <Input value={region} onChange={(e) => setRegion(e.target.value)} className={inputCls} placeholder="e.g. Manchester, UK" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Website (optional)</label>
              <div className="mt-1 relative">
                <Globe size={15} className="absolute left-3 top-3 text-muted-foreground" />
                <Input value={website} onChange={(e) => setWebsite(e.target.value)} className={inputCls} placeholder="https://…" />
              </div>
            </div>
          </div>
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
              <Input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="At least 8 characters" />
            </div>
          </div>
          <Button type="submit" disabled={loading} variant="secondary" className="w-full gap-2 py-2.5 h-auto">
            {loading ? "Creating…" : "Create supplier account"} <ArrowRight size={15} />
          </Button>
        </form>

        <div className="mt-5 text-center text-sm text-muted-foreground">
          Already a supplier?{" "}
          <Link href="/supplier/login" className="font-semibold text-foreground hover:underline">Sign in</Link>
        </div>
        <div className="mt-3 text-center text-xs text-muted-foreground">
          <Link href="/marketplace" className="hover:text-muted-foreground">← Back to marketplace</Link>
        </div>
      </div>
    </div>
  );
}
