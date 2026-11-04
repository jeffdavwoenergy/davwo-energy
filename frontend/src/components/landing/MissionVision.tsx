"use client";
/* eslint-disable @next/next/no-img-element */

import { ArrowRight, Smartphone, Sparkles, ShieldCheck, Activity, Globe2, type LucideIcon } from "lucide-react";

/* Photos (public/landing/mission), all under the free Unsplash License:
 *   mission-lagos.jpg          Ninthgrid, Lagos, Nigeria
 *   mobile-first-portrait.jpg  Adeniji Abdullahi A (@akinggraphic)
 *   ani-intelligence.jpg       ThisisEngineering
 *   vision-europe.jpg          Markus Spiske, Middle Franconia, Germany */

interface WideCard {
  kind: "wide";
  label: string;
  title: string;
  body: string;
  cta: string;
  image: string;
  /** CSS object-position, so the person stays in frame at every width. */
  focus: string;
}
interface PhotoCard {
  kind: "photo";
  label: string;
  title: string;
  body: string;
  image: string;
  focus: string;
  icon: LucideIcon;
}
interface SolidCard {
  kind: "solid";
  label: string;
  title: string;
  body: string;
  icon: LucideIcon;
  tone: "teal" | "navy";
}
type Card = WideCard | PhotoCard | SolidCard;

const ROWS: Card[][] = [
  [
    {
      kind: "wide",
      label: "Our mission",
      title: "Energise Nigeria, one rooftop at a time.",
      body: "Too many Nigerian homes and businesses still run on diesel generators. We're making solar and storage the obvious, affordable choice, from Lagos to the smallest town.",
      cta: "Explore solar and storage",
      image: "/landing/mission/mission-lagos.jpg",
      focus: "50% 30%",
    },
    {
      kind: "photo",
      label: "Mobile-first",
      title: "Your energy, in your pocket.",
      body: "Compare quotes, track your system and spread the cost, all from your phone.",
      image: "/landing/mission/mobile-first-portrait.jpg",
      focus: "50% 35%",
      icon: Smartphone,
    },
    {
      kind: "photo",
      label: "ANI™ intelligence",
      title: "Answers, not spreadsheets.",
      body: "Ask ANI™ what your devices are doing and what to do next, in plain English.",
      image: "/landing/mission/ani-intelligence.jpg",
      focus: "78% 30%",
      icon: Sparkles,
    },
  ],
  [
    {
      kind: "solid",
      tone: "teal",
      label: "Verified suppliers",
      title: "Buy with confidence.",
      body: "Verified-supplier badges show which installers have been checked before you request a quote.",
      icon: ShieldCheck,
    },
    {
      kind: "solid",
      tone: "navy",
      label: "Live monitoring",
      title: "Real devices, real data.",
      body: "Connect chargers, batteries and solar to see them live, with alerts the moment something needs attention.",
      icon: Activity,
    },
    {
      kind: "wide",
      label: "Our vision",
      title: "Clean energy in every corner of Europe.",
      body: "From Bavarian rooftops to Irish farms and Spanish fleet depots, we want every household and business in Europe to find, finance and run clean energy in a few taps.",
      cta: "Join the marketplace",
      image: "/landing/mission/vision-europe.jpg",
      focus: "50% 50%",
    },
  ],
];

const CARD = "group relative rounded-[28px] sm:rounded-[32px] overflow-hidden border border-black/5 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl min-h-[380px] sm:min-h-[440px] md:min-h-[500px]";

function Photo({ src, focus, alt }: { src: string; focus: string; alt: string }) {
  return (
    <>
      <img src={src} alt={alt} loading="lazy" style={{ objectPosition: focus }}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" />
      {/* Navy brand tint + a bottom fade so white text always reads. */}
      <div className="absolute inset-0 bg-[#0c132b]/25 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0c132b]/95 via-[#0c132b]/45 to-transparent pointer-events-none" />
    </>
  );
}

function Label({ children, light = true }: { children: React.ReactNode; light?: boolean }) {
  return (
    <div className={`text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] ${light ? "text-emerald-300" : "text-[#042823]/70"}`}>
      {children}
    </div>
  );
}

function CardView({ card, onCta }: { card: Card; onCta: () => void }) {
  if (card.kind === "wide") {
    return (
      <article className={`${CARD} sm:col-span-2 bg-neutral-900 text-white flex flex-col justify-end p-7 sm:p-9 md:p-10`}>
        <Photo src={card.image} focus={card.focus} alt="" />
        <div className="relative z-10 max-w-xl">
          <Label>{card.label}</Label>
          <h3 className="mt-2 text-3xl sm:text-4xl md:text-[42px] font-bold tracking-tight leading-[1.1] drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
            {card.title}
          </h3>
          <p className="mt-4 text-sm sm:text-base text-white/85 leading-relaxed">{card.body}</p>
          <button onClick={onCta} className="mt-6 inline-flex items-center gap-2 text-sm sm:text-base font-semibold text-white hover:text-emerald-300 transition-colors">
            {card.cta} <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </article>
    );
  }
  const Icon = card.icon;
  if (card.kind === "photo") {
    return (
      <article className={`${CARD} bg-neutral-900 text-white flex flex-col justify-between p-6 sm:p-7`}>
        <Photo src={card.image} focus={card.focus} alt="" />
        <div className="relative z-10 w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
        <div className="relative z-10">
          <Label>{card.label}</Label>
          <h3 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">{card.title}</h3>
          <p className="mt-2 text-sm text-white/80 leading-relaxed">{card.body}</p>
        </div>
      </article>
    );
  }
  const teal = card.tone === "teal";
  return (
    <article className={`${CARD} flex flex-col justify-between p-6 sm:p-7 ${teal ? "bg-[#12d2bf] text-[#042823]" : "bg-[#0c132b] text-white"}`}>
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${teal ? "bg-[#042823]/10" : "bg-white/10 border border-white/15"}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <Label light={!teal}>{card.label}</Label>
        <h3 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight leading-tight">{card.title}</h3>
        <p className={`mt-2 text-sm leading-relaxed ${teal ? "text-[#042823]/80" : "text-white/75"}`}>{card.body}</p>
      </div>
    </article>
  );
}

export function MissionVision({ onOpenMarketplace }: { onOpenMarketplace: () => void }) {
  return (
    <section className="w-full bg-white py-14 sm:py-[72px] md:py-24 border-b border-neutral-100">
      <div className="max-w-[1280px] mx-auto px-6 sm:px-8 lg:px-12 xl:px-14">
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold uppercase tracking-wider mb-3 border border-emerald-200/60">
            <Globe2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Our Mission &amp; Vision</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-neutral-900 tracking-tight">Clean power, from Lagos to Lisbon.</h2>
          <p className="mt-3 text-sm sm:text-base text-neutral-600 max-w-2xl mx-auto">
            DAVWO connects homes, businesses and communities with trusted clean-energy suppliers, and gives them the intelligence to run it well.
          </p>
        </div>

        <div className="space-y-5 sm:space-y-6">
          {ROWS.map((row, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
              {row.map((card) => <CardView key={card.title} card={card} onCta={onOpenMarketplace} />)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
