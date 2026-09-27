import { Link } from "@/i18n/navigation";
import {
  ArrowRight,
  Activity,
  LineChart,
  TrendingUp,
  Lightbulb,
  Leaf,
  PoundSterling,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const CAPABILITIES = [
  { icon: Activity, title: "Monitor", body: "Live telemetry across EV chargers, batteries, solar and grid points." },
  { icon: LineChart, title: "Analyse", body: "Utilisation, cost and demand analytics with real UK grid context." },
  { icon: TrendingUp, title: "Predict", body: "Demand forecasts with confidence bands and named, explainable drivers." },
  { icon: Lightbulb, title: "Recommend", body: "Quantified, actionable next steps — never vague, always with a 'why'." },
];

const STATS = [
  { icon: PoundSterling, label: "Live tariff", value: "Octopus Agile" },
  { icon: Leaf, label: "Live carbon", value: "gCO₂/kWh" },
  { icon: TrendingUp, label: "Forecast", value: "Weather-driven" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-navy text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-map-dark opacity-90" />
      <div className="absolute inset-0 bg-grain" />

      <div className="relative z-10">
        <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/davwo-icon-white.png" alt="DAVWO" className="h-9 w-auto" />
            <span className="font-display font-bold text-2xl tracking-tight text-white">DAVWO</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
              <Link href="/products">Marketplace</Link>
            </Button>
            <Button asChild variant="secondary" className="bg-white/10 text-white hover:bg-white/20">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </header>

        <section className="max-w-6xl mx-auto px-6 pt-12 pb-20 lg:pt-20">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 border border-emerald-400/30 px-3 py-1 text-xs font-semibold text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-soft-pulse" />
            Augmented Network Intelligence
          </div>
          <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-display font-bold tracking-tight max-w-3xl leading-[1.05]">
            Turn energy infrastructure data into{" "}
            <span className="text-emerald-400">decisions</span>.
          </h1>
          <p className="mt-5 text-lg text-slate-300 max-w-2xl">
            ANI™ monitors, analyses, predicts, recommends and optimises EV-charging, battery,
            solar and grid assets — wired to real UK energy data, with answers you can see in
            charts, not walls of text.
          </p>
          <p className="mt-4 text-base text-slate-400 max-w-2xl">
            ANI™ is Davwo&rsquo;s proprietary AI engine that continuously monitors, predicts,
            explains, and optimises distributed energy infrastructure across EV charging,
            batteries, solar, and future grid assets&mdash;helping organisations reduce costs,
            lower emissions, and improve operational performance.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild className="gap-2 bg-emerald-500 py-3 h-auto px-5 text-navy hover:bg-emerald-400">
              <Link href="/signup">Start your pilot <ArrowRight size={18} /></Link>
            </Button>
            <Button asChild variant="secondary" className="py-3 h-auto px-5 bg-white/10 text-white hover:bg-white/20">
              <Link href="/login">Sign in / try a demo role</Link>
            </Button>
            <Button asChild variant="link" className="gap-2 px-2 py-3 h-auto text-slate-300 hover:text-white">
              <Link href="/products">Browse the Davwo Marketplace →</Link>
            </Button>
          </div>

          <div className="mt-10 flex flex-wrap gap-4">
            {STATS.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3"
              >
                <Icon size={18} className="text-emerald-300" />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
                  <div className="text-sm font-semibold">{value}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-6 pb-24">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-300">
                  <Icon size={20} />
                </div>
                <div className="mt-4 font-display font-semibold text-lg">{title}</div>
                <p className="mt-1 text-sm text-slate-400 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t border-white/10">
          <div className="max-w-6xl mx-auto px-6 py-6 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
            <span>© 2026 Davwo Energy Ltd.</span>
            <span>Monitor · Analyse · Predict · Recommend · Optimise</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
