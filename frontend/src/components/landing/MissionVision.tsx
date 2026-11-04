"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { ArrowRight, Smartphone, Sparkles, ShieldCheck, Activity, Globe2, Sun, type LucideIcon } from "lucide-react";

/* Photos (public/landing/mission), all under the free Unsplash License:
 *   mission-lagos.jpg          Ninthgrid, Lagos, Nigeria
 *   mobile-first-portrait.jpg  Adeniji Abdullahi A (@akinggraphic)
 *   ani-intelligence.jpg       ThisisEngineering
 *   vision-europe.jpg          Markus Spiske, Middle Franconia, Germany */

interface Panel {
  label: string;
  title: string;
  body: string;
  image: string;
  /** CSS object-position, so the person stays in frame at every width. */
  focus: string;
  icon: LucideIcon;
  cta?: string;
}

const PANELS: Panel[] = [
  {
    label: "Our mission",
    title: "Energise Nigeria, one rooftop at a time.",
    body: "Too many Nigerian homes and businesses still run on diesel generators. We're making solar and storage the obvious, affordable choice, from Lagos to the smallest town.",
    image: "/landing/mission/mission-lagos.jpg",
    focus: "50% 30%",
    icon: Sun,
    cta: "Explore solar and storage",
  },
  {
    label: "Mobile-first",
    title: "Your energy, in your pocket.",
    body: "Compare quotes, track your system and spread the cost, all from your phone.",
    image: "/landing/mission/mobile-first-portrait.jpg",
    focus: "50% 35%",
    icon: Smartphone,
    cta: "Browse the marketplace",
  },
  {
    label: "ANI™ intelligence",
    title: "Answers, not spreadsheets.",
    body: "Ask ANI™ what your devices are doing and what to do next, in plain English.",
    image: "/landing/mission/ani-intelligence.jpg",
    focus: "78% 30%",
    icon: Sparkles,
  },
];

const FEATURES: { label: string; title: string; body: string; icon: LucideIcon }[] = [
  {
    label: "Verified suppliers",
    title: "Buy with confidence.",
    body: "Verified-supplier badges show which installers have been checked before you request a quote.",
    icon: ShieldCheck,
  },
  {
    label: "Live monitoring",
    title: "Real devices, real data.",
    body: "Connect chargers, batteries and solar to see them live, with alerts the moment something needs attention.",
    icon: Activity,
  },
];

/** Expanding photo panels: the active one opens wide with its story, the
 * others narrow to a photo and an icon. Pointing at a panel opens it on
 * desktop; on touch screens a tap does, and the row keeps the same
 * side-by-side layout at every width. */
function ExpandingPanels({ onCta }: { onCta: () => void }) {
  const [active, setActive] = useState(0);

  return (
    <div className="flex gap-2.5 sm:gap-4 h-[440px] sm:h-[480px] md:h-[520px]">
      {PANELS.map((p, i) => {
        const open = i === active;
        const Icon = p.icon;
        return (
          <div
            key={p.title}
            role="button"
            tabIndex={0}
            aria-expanded={open}
            aria-label={p.title}
            onPointerEnter={(e) => { if (e.pointerType === "mouse") setActive(i); }}
            onClick={() => setActive(i)}
            onFocus={() => setActive(i)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActive(i); } }}
            className={`group relative min-w-0 overflow-hidden rounded-[24px] sm:rounded-[32px] bg-neutral-900 text-white shadow-md cursor-pointer outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/50 transition-[flex-grow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              open ? "grow-[6] sm:grow-[4]" : "grow"
            } basis-0`}
          >
            <img src={p.image} alt="" loading="lazy" style={{ objectPosition: p.focus }}
              className={`absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out ${open ? "scale-100" : "scale-110"}`} />
            {/* Navy brand tint (the reference's blue wash) + a bottom fade so text reads. */}
            <div className="absolute inset-0 bg-[#1a237e]/25 mix-blend-multiply pointer-events-none" />
            <div className={`absolute inset-0 bg-gradient-to-t from-[#0c132b]/95 via-[#0c132b]/40 to-[#0c132b]/10 pointer-events-none transition-opacity duration-500 ${open ? "opacity-100" : "opacity-60"}`} />

            {/* Collapsed: just the icon, centred. */}
            <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${open ? "opacity-0" : "opacity-100 delay-150"}`}>
              <Icon className="w-6 h-6 sm:w-8 sm:h-8 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]" />
            </div>

            {/* Open: the story. A fixed min-width stops the text reflowing
                while the panel animates; the panel clips it until it fits. */}
            <div
              aria-hidden={!open}
              className={`absolute inset-0 flex flex-col justify-between p-5 sm:p-8 md:p-10 min-w-[240px] sm:min-w-[420px] transition-opacity duration-300 ${open ? "opacity-100 delay-200" : "opacity-0 pointer-events-none"}`}
            >
              <Icon className="w-6 h-6 sm:w-7 sm:h-7" />
              <div className="max-w-xl">
                <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">{p.label}</div>
                <h3 className="mt-2 text-2xl sm:text-4xl md:text-[42px] font-bold tracking-tight leading-[1.1] drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                  {p.title}
                </h3>
                <p className="mt-3 sm:mt-4 text-sm sm:text-base text-white/85 leading-relaxed">{p.body}</p>
                {p.cta && (
                  <button
                    tabIndex={open ? 0 : -1}
                    onClick={(e) => { e.stopPropagation(); onCta(); }}
                    className="mt-5 sm:mt-6 inline-flex items-center gap-2 text-sm sm:text-base font-semibold text-white hover:text-emerald-300 transition-colors"
                  >
                    {p.cta} <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The Europe vision as one wide split card: photo on one side, the vision
 * plus the two platform features on a navy panel on the other — a different
 * shape from the expanding row above it, on purpose. */
function VisionCard({ onCta }: { onCta: () => void }) {
  return (
    <div className="grid lg:grid-cols-5 overflow-hidden rounded-[28px] sm:rounded-[32px] bg-[#0c132b] text-white shadow-md border border-black/5">
      <div className="relative lg:col-span-2 min-h-[260px] sm:min-h-[320px]">
        <img src="/landing/mission/vision-europe.jpg" alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-transparent via-transparent to-[#0c132b]/70 pointer-events-none" />
        <div className="absolute left-5 bottom-5 sm:left-7 sm:bottom-7 inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 px-3 py-1 text-[11px] sm:text-xs font-semibold uppercase tracking-wider">
          <Globe2 className="w-3.5 h-3.5" /> Our vision
        </div>
      </div>

      <div className="lg:col-span-3 p-6 sm:p-9 md:p-11 flex flex-col justify-center">
        <h3 className="text-3xl sm:text-4xl font-bold tracking-tight leading-[1.1]">Clean energy in every corner of Europe.</h3>
        <p className="mt-4 text-sm sm:text-base text-white/75 leading-relaxed max-w-xl">
          From Bavarian rooftops to Irish farms and Spanish fleet depots, we want every household and business in Europe to find, finance and run clean energy in a few taps.
        </p>

        <div className="mt-7 grid sm:grid-cols-2 gap-3 sm:gap-4">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="rounded-2xl bg-white/[0.06] border border-white/10 p-4 sm:p-5">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-xl bg-[#12d2bf] text-[#042823] flex items-center justify-center shrink-0">
                    <Icon className="w-[18px] h-[18px]" />
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300">{f.label}</span>
                </div>
                <div className="mt-3 font-semibold text-base sm:text-lg">{f.title}</div>
                <p className="mt-1 text-sm text-white/70 leading-relaxed">{f.body}</p>
              </div>
            );
          })}
        </div>

        <button onClick={onCta} className="mt-7 self-start inline-flex items-center gap-2 rounded-full bg-[#12d2bf] hover:bg-[#0fbfad] text-[#042823] px-5 py-2.5 text-sm font-semibold transition-colors">
          Join the marketplace <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
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

        <ExpandingPanels onCta={onOpenMarketplace} />
        <div className="mt-5 sm:mt-6">
          <VisionCard onCta={onOpenMarketplace} />
        </div>
      </div>
    </section>
  );
}
