"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { X, ArrowUpRight, CheckCircle2, TrendingUp, Sparkles } from "lucide-react";

interface CaseStudyCard {
  id: string;
  type: "feature" | "photo";
  title: string;
  image?: string;
  category: string;
  stat: string;
  summary: string;
  solutions: string[];
}

export function HowDavwoWorks({ onOpenMarketplace }: { onOpenMarketplace: () => void }) {
  const [activeModalCard, setActiveModalCard] = useState<CaseStudyCard | null>(null);

  const cards: CaseStudyCard[] = [
    {
      id: "fleet-management",
      type: "feature",
      title: "EV fleet management: the challenges and how we help",
      category: "Fleet & Energy Optimization",
      stat: "40% reduction in peak depot power tariffs",
      summary:
        "Managing electric commercial fleets demands synchronized grid capacity, dynamic load-balancing, and automated tariff scheduling. The DAVWO enterprise suite delivers real-time telematics and intelligent power allocation to ensure vehicles are always ready for service at the lowest possible cost per mile.",
      solutions: [
        "Dynamic Depot Power Balancing preventing costly substation demand peaks",
        "Automated overnight charging timed to lowest off-peak renewable tariffs",
        "Unified billing reconciliation across private depots and public charging corridors",
        "Continuous battery health tracking and route-specific energy forecasting",
      ],
    },
    {
      id: "grants-guide",
      type: "photo",
      title: "A guide to EV grants for LAs and businesses",
      image: "/landing/fleet_ev_parking_garage_1790536557412.jpg",
      category: "Public Grants & Subsidies",
      stat: "Up to 75% funded through public and local subsidies",
      summary:
        "Navigating government incentives, regional clean energy grants, and capital allowances can significantly lower upfront capital expenditure for fleet electrification. DAVWO partners with local authorities and enterprise fleets to streamline grant applications and accelerate clean infrastructure rollouts.",
      solutions: [
        "Workplace Charging Scheme & Infrastructure Grant eligibility auditing",
        "Local Authority Clean Air and decarbonization fund coordination",
        "Zero-down Power Purchase Agreement (PPA) integration with grant supplements",
        "Full compliance certification and carbon offset documentation for ESG reports",
      ],
    },
    {
      id: "nottingham-council",
      type: "photo",
      title: "How Nottingham Council save £1m on EV charging annually",
      image: "/landing/fleet_council_green_buses_1790536573023.jpg",
      category: "Municipal Fleet Decarbonization",
      stat: "£1,020,000 net annual operating savings",
      summary:
        "By transitioning 240+ municipal service vehicles, waste collection trucks, and community transit buses to DAVWO-managed smart charging infrastructure, Nottingham Council drastically lowered lifecycle fuel costs while meeting statutory net-zero carbon milestones years ahead of target.",
      solutions: [
        "240 municipal vehicles electrified across 4 centralized council depots",
        "Solar photovoltaic canopy arrays directly feeding smart storage batteries",
        "Vehicle-to-Grid (V2G) trial exporting power back during peak evening tariffs",
        "Over 1,800 tons of localized urban particulate and CO2 emissions eradicated",
      ],
    },
    {
      id: "scania-growth",
      type: "photo",
      title: "Inside Scania UK's plans growth to 45 sites by 2030",
      image: "/landing/fleet_commercial_truck_charging_1790536590056.jpg",
      category: "Heavy Logistics Megawatt Charging",
      stat: "45 mega-depot locations by 2030",
      summary:
        "Electrifying 44-tonne heavy haulage trucks requires megawatt-level charging reliability. Scania UK is deploying multi-megawatt depot charging hubs equipped with DAVWO AI demand matching to deliver predictable 45-minute turnaround times for heavy logistics freight.",
      solutions: [
        "Ultra-fast 350kW to 1MW Megawatt Charging System (MCS) integration",
        "Resilient microgrid battery buffers preventing local grid substation overloads",
        "Driver automated reservation and dwell-time energy allocation software",
        "Scalable blueprint scaling across 45 strategic UK freight corridors by 2030",
      ],
    },
  ];

  return (
    <section className="w-full bg-white py-14 sm:py-[72px] md:py-24 border-b border-neutral-100">
      <div className="max-w-[1280px] mx-auto px-6 sm:px-8 lg:px-12 xl:px-14">
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold uppercase tracking-wider mb-3 border border-emerald-200/60">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Proven Enterprise &amp; Municipal Solutions</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-neutral-900 tracking-tight">How the DAVWO App Works</h2>
          <p className="mt-3 text-sm sm:text-base text-neutral-600 max-w-2xl mx-auto font-normal">
            From smart commercial fleet load-balancing to municipal subsidies and heavy freight corridors, see how DAVWO powers real-world
            transition.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
          {cards.map((card) => {
            const isFeature = card.type === "feature";
            return (
              <div
                key={card.id}
                onClick={() => setActiveModalCard(card)}
                className={`group relative rounded-[28px] sm:rounded-[32px] overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1.5 shadow-md hover:shadow-2xl border border-black/5 flex flex-col justify-between select-none ${
                  isFeature
                    ? "bg-[#12d2bf] text-[#042823] min-h-[420px] sm:min-h-[450px] md:min-h-[480px] p-7 sm:p-8"
                    : "bg-neutral-900 text-white min-h-[420px] sm:min-h-[450px] md:min-h-[480px] p-6 sm:p-7"
                }`}
              >
                {!isFeature && (
                  <>
                    <img
                      src={card.image}
                      alt={card.title}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-black/20 pointer-events-none" />
                  </>
                )}

                <div className="relative z-10 flex justify-end">
                  <div className="relative w-12 h-12 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                    <div
                      className={`absolute top-0 right-0 w-9 h-9 border-t-2 border-r-2 rounded-tr-2xl pointer-events-none transition-colors duration-300 ${
                        isFeature ? "border-[#042823]/60 group-hover:border-[#042823]" : "border-white/60 group-hover:border-white"
                      }`}
                    />
                    <ArrowUpRight
                      className={`w-5 h-5 stroke-[2.2] transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${
                        isFeature ? "text-[#042823]" : "text-white"
                      }`}
                    />
                  </div>
                </div>

                <div className="relative z-10 mt-auto">
                  <h3
                    className={`font-bold tracking-tight leading-[1.25] text-left transition-opacity group-hover:opacity-95 ${
                      isFeature
                        ? "text-2xl sm:text-[26px] md:text-[28px] text-[#042823]"
                        : "text-xl sm:text-2xl md:text-[24px] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
                    }`}
                  >
                    {card.title}
                  </h3>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {activeModalCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col text-neutral-900">
            <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-neutral-100 bg-[#042823] text-white">
              <div>
                <span className="text-xs uppercase tracking-wider text-[#12d2bf] font-bold">{activeModalCard.category}</span>
                <h2 className="text-xl sm:text-2xl font-bold mt-1 text-white leading-tight">{activeModalCard.title}</h2>
              </div>
              <button
                onClick={() => setActiveModalCard(null)}
                className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 sm:p-8 overflow-y-auto space-y-6">
              {activeModalCard.image && (
                <div className="aspect-[16/9] rounded-2xl overflow-hidden relative shadow-md">
                  <img src={activeModalCard.image} alt={activeModalCard.title} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#12d2bf] text-[#042823] flex items-center justify-center font-bold">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Documented Result</div>
                  <div className="text-sm font-semibold text-neutral-900">{activeModalCard.stat}</div>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Executive Summary</h4>
                <p className="text-sm text-neutral-700 leading-relaxed">{activeModalCard.summary}</p>
              </div>
              <div>
                <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Key Solutions Implemented</h4>
                <div className="space-y-2">
                  {activeModalCard.solutions.map((point, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-neutral-800 p-2.5 bg-neutral-50 rounded-xl border border-neutral-100">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-4 border-t border-neutral-100 flex items-center justify-between">
                <span className="text-xs text-neutral-500">Ready to optimize your clean energy operations?</span>
                <button
                  onClick={() => {
                    setActiveModalCard(null);
                    onOpenMarketplace();
                  }}
                  className="px-5 py-2.5 bg-[#042823] hover:bg-[#031d19] text-[#12d2bf] rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Explore Solutions</span>
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
