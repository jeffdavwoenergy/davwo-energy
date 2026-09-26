"use client";

import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  Building2, Boxes, Target, Rocket, ArrowRight, ArrowLeft, Check,
  Store, TrendingDown, Leaf, PoundSterling, Loader2,
} from "lucide-react";
import api from "@/lib/api";
import PageHeader from "@/components/shared/PageHeader";
import Panel from "@/components/shared/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Objective = "cut-costs" | "reduce-carbon" | "improve-uptime" | "grow-revenue" | "compliance";
const OBJECTIVES: { id: Objective; label: string }[] = [
  { id: "cut-costs", label: "Cut energy costs" },
  { id: "reduce-carbon", label: "Reduce carbon emissions" },
  { id: "improve-uptime", label: "Improve asset uptime & reliability" },
  { id: "grow-revenue", label: "Grow revenue from assets" },
  { id: "compliance", label: "Meet compliance & reporting (SECR/ESOS)" },
];

interface Workspace {
  id: string;
  organisation: string;
  profileSummary: string;
  estimated: { annualSpendGbp: number; annualSavingGbp: number; annualCo2SavingT: number };
  insights: { severity: string; title: string; detail: string }[];
  recommendedPartners: { category: string; categoryLabel: string; reason: string; vendor?: string; productId?: string; productName?: string }[];
  dataMode: string;
}

const STEPS = ["Organisation", "Infrastructure", "Objectives", "Your ANI™ workspace"];

const num = (v: string) => (v === "" ? 0 : Math.max(0, Number(v) || 0));

export default function PilotOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [org, setOrg] = useState("");
  const [sector, setSector] = useState("");
  const [region, setRegion] = useState("");
  const [ev, setEv] = useState("");
  const [solar, setSolar] = useState("");
  const [battery, setBattery] = useState("");
  const [meters, setMeters] = useState("");
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [challenges, setChallenges] = useState("");
  const [loading, setLoading] = useState(false);
  const [ws, setWs] = useState<Workspace | null>(null);
  const [error, setError] = useState("");

  const toggleObj = (id: Objective) =>
    setObjectives((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post<Workspace>("/pilot/onboard", {
        organisation: org, sector, region,
        evChargers: num(ev), solarKw: num(solar), batteryKwh: num(battery), smartMeters: num(meters),
        objectives, challenges,
      });
      setWs(data);
      setStep(3);
    } catch {
      setError("Could not build your workspace just now — please try again.");
    } finally {
      setLoading(false);
    }
  };

  const canNext = step === 0 ? org.trim().length > 0 : true;

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="Start your ANI™ pilot"
        subtitle="A few questions, and ANI™ builds you a working workspace — no empty dashboard, ever."
      />

      {/* progress */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
              i < step ? "bg-emerald-500 text-white" : i === step ? "bg-navy text-white" : "bg-muted text-muted-foreground"
            }`}>
              {i < step ? <Check size={14} /> : i + 1}
            </div>
            <span className={`text-xs hidden sm:block ${i === step ? "text-foreground font-semibold" : "text-muted-foreground"}`}>{label}</span>
            {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 ${i < step ? "bg-emerald-500" : "bg-muted"}`} />}
          </div>
        ))}
      </div>

      {/* STEP 0 — Organisation */}
      {step === 0 && (
        <Panel title="Register your organisation" right={<Building2 size={18} className="text-muted-foreground" />}>
          <div className="space-y-3">
            <Field label="Organisation name *"><Input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="e.g. Northbridge Mobility" /></Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Sector"><Input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="e.g. Fleet / Depot operator" /></Field>
              <Field label="Region"><Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. Manchester, UK" /></Field>
            </div>
          </div>
        </Panel>
      )}

      {/* STEP 1 — Infrastructure */}
      {step === 1 && (
        <Panel title="Your infrastructure" subtitle="Rough numbers are fine — ANI™ refines them once assets connect." right={<Boxes size={18} className="text-muted-foreground" />}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="EV charge points"><Input type="number" min="0" value={ev} onChange={(e) => setEv(e.target.value)} placeholder="0" /></Field>
            <Field label="Solar capacity (kW)"><Input type="number" min="0" value={solar} onChange={(e) => setSolar(e.target.value)} placeholder="0" /></Field>
            <Field label="Battery storage (kWh)"><Input type="number" min="0" value={battery} onChange={(e) => setBattery(e.target.value)} placeholder="0" /></Field>
            <Field label="Smart meters"><Input type="number" min="0" value={meters} onChange={(e) => setMeters(e.target.value)} placeholder="0" /></Field>
          </div>
        </Panel>
      )}

      {/* STEP 2 — Objectives */}
      {step === 2 && (
        <Panel title="Business objectives" subtitle="What matters most? ANI™ tailors its first insights to these." right={<Target size={18} className="text-muted-foreground" />}>
          <div className="grid sm:grid-cols-2 gap-2">
            {OBJECTIVES.map((o) => {
              const on = objectives.includes(o.id);
              return (
                <button key={o.id} onClick={() => toggleObj(o.id)}
                  className={`text-left px-3.5 py-3 rounded-xl border text-sm font-medium transition flex items-center gap-2 ${
                    on ? "border-emerald-400 dark:border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "border-border text-muted-foreground hover:border-emerald-300/50"
                  }`}>
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-emerald-500 border-emerald-500" : "border-border"}`}>
                    {on && <Check size={11} className="text-white" />}
                  </span>
                  {o.label}
                </button>
              );
            })}
          </div>
          <Field label="Operational challenges (optional)" className="mt-4">
            <Textarea value={challenges} onChange={(e) => setChallenges(e.target.value)} rows={3} maxLength={1000}
              className="resize-none" placeholder="Tell ANI™ what you're wrestling with today…" />
          </Field>
          {error && <div className="mt-3 text-sm text-destructive">{error}</div>}
        </Panel>
      )}

      {/* STEP 3 — Generated workspace */}
      {step === 3 && ws && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-2 text-white p-6">
            <div className="flex items-center gap-2 text-emerald-300 text-sm font-semibold">
              <Rocket size={18} /> Your workspace is live
            </div>
            <h2 className="mt-2 text-xl font-display font-bold">{ws.organisation}</h2>
            <p className="text-sm text-slate-300 mt-1">{ws.profileSummary}</p>
            <div className="mt-5 grid grid-cols-3 gap-4">
              <Stat icon={PoundSterling} label="Est. annual saving" value={`£${ws.estimated.annualSavingGbp.toLocaleString()}`} />
              <Stat icon={Leaf} label="CO₂ avoided / yr" value={`${ws.estimated.annualCo2SavingT} tCO₂`} />
              <Stat icon={TrendingDown} label="Annual spend base" value={`£${ws.estimated.annualSpendGbp.toLocaleString()}`} />
            </div>
            <div className="mt-4 text-[11px] text-slate-400">
              Simulated from your profile until live assets connect — every figure sharpens automatically as real data flows in.
            </div>
          </div>

          <Panel title="ANI™ insights for you" subtitle="Generated from your infrastructure profile" right={<Target size={18} className="text-emerald-500" />}>
            <div className="space-y-3">
              {ws.insights.map((ins, i) => (
                <div key={i} className="rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${
                      ins.severity === "opportunity" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : ins.severity === "action" ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" : "bg-muted text-muted-foreground"
                    }`}>{ins.severity}</span>
                    <span className="text-sm font-semibold text-foreground">{ins.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{ins.detail}</p>
                </div>
              ))}
            </div>
          </Panel>

          {ws.recommendedPartners.length > 0 && (
            <Panel title="Recommended partners" subtitle="ANI™ matches your profile to verified providers in the Marketplace" right={<Store size={18} className="text-muted-foreground" />}>
              <div className="grid sm:grid-cols-2 gap-3">
                {ws.recommendedPartners.map((p) => (
                  <Link
                    key={p.category}
                    href={p.productId ? `/products/${p.productId}` : `/marketplace?category=${p.category}`}
                    className="rounded-xl border border-border p-4 hover:border-emerald-300 dark:hover:border-emerald-500/40 hover:bg-emerald-50/40 dark:hover:bg-emerald-500/10 transition"
                  >
                    <div className="text-sm font-semibold text-foreground">{p.categoryLabel}</div>
                    <p className="text-xs text-muted-foreground mt-1">{p.reason}</p>
                    {p.productName && <div className="mt-2 text-xs text-emerald-600 font-medium">e.g. {p.productName} →</div>}
                    {!p.productName && p.vendor && <div className="mt-2 text-xs text-emerald-600 font-medium">e.g. {p.vendor} →</div>}
                  </Link>
                ))}
              </div>
            </Panel>
          )}

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => router.push("/dashboard")} className="gap-2">
              Enter your dashboard <ArrowRight size={16} />
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/marketplace"><Store size={16} /> Explore the Marketplace</Link>
            </Button>
          </div>
        </div>
      )}

      {/* nav */}
      {step < 3 && (
        <div className="flex items-center justify-between mt-6">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
            className="gap-1.5 text-muted-foreground disabled:opacity-0">
            <ArrowLeft size={15} /> Back
          </Button>
          {step < 2 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext} className="gap-2">
              Continue <ArrowRight size={16} />
            </Button>
          ) : (
            <Button onClick={generate} disabled={loading} className="gap-2">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Building your workspace…</> : <><Rocket size={16} /> Build my workspace</>}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
      {children}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof PoundSterling; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400"><Icon size={12} /> {label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}
