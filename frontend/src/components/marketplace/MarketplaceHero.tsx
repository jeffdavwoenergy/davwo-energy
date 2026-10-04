"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { ArrowRight, Store, UserPlus } from "lucide-react";
import { Link } from "@/i18n/navigation";

const SLIDES = [
  { id: 0, image: "/landing/fleet_ev_parking_garage_1790536557412.jpg", alt: "EV chargers in a car park" },
  { id: 1, image: "/landing/solar_rooftop_modern_home_1790535700825.jpg", alt: "Rooftop solar on a modern home" },
  { id: 2, image: "/landing/solar_farm_ground_mount_1790535685410.jpg", alt: "Ground-mounted solar farm" },
];

// The landing page's DavwoHero, shortened for the top of the marketplace.
export function MarketplaceHero({ onBrowse }: { onBrowse: () => void }) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => setActiveSlide((p) => (p === SLIDES.length - 1 ? 0 : p + 1)), 5000);
    return () => clearInterval(timer);
  }, [isPaused]);

  return (
    <section
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="group/hero relative w-full rounded-[28px] sm:rounded-[32px] overflow-hidden min-h-[370px] sm:min-h-[400px] lg:min-h-[450px] mb-4 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] flex flex-col justify-between bg-[#041226] border border-black/10 select-none"
    >
      {SLIDES.map((slide, index) => (
        <div
          key={slide.id}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            activeSlide === index ? "opacity-100 z-0" : "opacity-0 -z-10"
          }`}
        >
          <img src={slide.image} alt={slide.alt} className="w-full h-full object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#030e1d]/75 via-[#041226]/50 to-[#030e1d]/85" />
        </div>
      ))}

      <div className="relative z-20 max-w-3xl mx-auto px-5 sm:px-16 text-center flex flex-col items-center my-auto pt-10 pb-4">
        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold mb-4 bg-white/10 border border-white/20 text-white backdrop-blur-md">
          <Store size={14} /> Davwo Marketplace
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.8)] leading-[1.1]">
          Lease, finance or buy your energy hardware
        </h1>
        <p className="mt-3 sm:mt-4 text-sm sm:text-base md:text-lg text-white/90 max-w-2xl mx-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] leading-relaxed">
          EV chargers, home batteries, solar, energy services and electric vehicles — supplied, installed and monitored by Davwo.
          Personalise your terms and see your monthly price instantly.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onBrowse}
            data-testid="mp-hero-browse"
            className="group rounded-full bg-white hover:bg-neutral-50 active:scale-[0.98] text-neutral-900 font-bold pl-6 pr-2 py-2 shadow-xl hover:shadow-2xl transition-all duration-200 flex items-center gap-3 cursor-pointer text-sm border border-white"
          >
            <span>Browse products</span>
            <span className="w-7 h-7 rounded-full bg-[#1b5e3a] group-hover:bg-[#13492c] text-white flex items-center justify-center shrink-0 transition-colors shadow-sm">
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </button>
        </div>
      </div>

      <div className="relative z-20 pb-5 flex items-center justify-center gap-2">
        {SLIDES.map((slide, index) => (
          <button
            key={slide.id}
            onClick={() => setActiveSlide(index)}
            aria-label={`Go to slide ${index + 1}`}
            className={`transition-all duration-300 cursor-pointer ${
              activeSlide === index
                ? "w-7 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                : "w-2 h-2 rounded-full bg-white/40 hover:bg-white/70"
            }`}
          />
        ))}
      </div>
    </section>
  );
}

// Shorter companion card under the hero, same look — invites suppliers to list.
export function MarketplaceSupplierCard() {
  return (
    <section className="relative w-full rounded-[20px] sm:rounded-[28px] overflow-hidden h-full min-h-[165px] sm:min-h-[200px] shadow-[0_20px_45px_-15px_rgba(0,0,0,0.3)] flex items-center bg-[#041226] border border-black/10">
      <img
        src="/landing/fleet_commercial_truck_charging_1790536590056.jpg"
        alt="Commercial vehicle charging"
        className="absolute inset-0 w-full h-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#030e1d]/80 via-[#041226]/60 to-[#030e1d]/85" />

      <div className="relative z-10 max-w-3xl mx-auto px-3 sm:px-10 py-4 sm:py-6 text-center flex flex-col items-center">
        <h2 className="text-lg sm:text-2xl md:text-3xl font-bold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] leading-tight">
          Sell on the Davwo Marketplace
        </h2>
        <p className="mt-2 text-xs sm:text-sm md:text-base text-white/85 max-w-xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
          List your chargers, batteries, solar and energy services with your own plan pricing, and reach buyers ready to order.
        </p>
        <div className="mt-4 sm:mt-5 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <Link
            href="/supplier/login"
            data-testid="mp-card-supplier-login"
            className="group rounded-full bg-white hover:bg-neutral-50 active:scale-[0.98] text-neutral-900 font-bold pl-4 sm:pl-5 pr-1.5 sm:pr-2 py-1 sm:py-1.5 shadow-xl transition-all duration-200 flex items-center gap-2 sm:gap-3 text-xs sm:text-sm border border-white"
          >
            <span>List your products</span>
            <span className="w-7 h-7 rounded-full bg-[#1b5e3a] group-hover:bg-[#13492c] text-white flex items-center justify-center shrink-0 transition-colors">
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </Link>
          <Link
            href="/supplier/signup"
            data-testid="mp-card-supplier-signup"
            className="rounded-full border border-white/25 bg-white/10 hover:bg-white/20 active:scale-[0.98] backdrop-blur-md text-white font-medium px-4 sm:px-5 py-1.5 sm:py-2 transition-all duration-200 flex items-center gap-2 text-xs sm:text-sm shadow-md"
          >
            <UserPlus className="w-4 h-4 text-white/90" />
            <span>Register your company</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

// Just the Davwo logo beside the supplier card — no card chrome, no animation.
export function MarketplaceLogoCard() {
  return (
    <div className="flex items-center justify-center h-full px-1 sm:px-4">
      <img src="/davwo-logo.png" alt="DAVWO" className="w-full max-w-[280px] h-auto" />
    </div>
  );
}
