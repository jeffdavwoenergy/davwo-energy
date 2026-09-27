"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, ArrowRight, UserPlus } from "lucide-react";

interface DavwoHeroProps {
  onJoinMarketplace: () => void;
  onBecomeSupplier: () => void;
}

export function DavwoHero({ onJoinMarketplace, onBecomeSupplier }: DavwoHeroProps) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const heroSlides = [
    { id: 0, image: "/landing/clean_energy_grid_hero_1790540262882.jpg", tag: "AI-Powered Clean Energy Grid" },
    { id: 1, image: "/landing/davwo_hero_clean_energy_1790535621526.jpg", tag: "Decentralized Solar & Storage" },
    { id: 2, image: "/landing/solar_rooftop_modern_home_1790535700825.jpg", tag: "Turnkey Residential & Commercial Power" },
  ];

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev === heroSlides.length - 1 ? 0 : prev + 1));
    }, 5000);
    return () => clearInterval(timer);
  }, [isPaused, heroSlides.length]);

  const prev = () => setActiveSlide((p) => (p === 0 ? heroSlides.length - 1 : p - 1));
  const next = () => setActiveSlide((p) => (p === heroSlides.length - 1 ? 0 : p + 1));

  return (
    <section className="w-full max-w-[1280px] mx-auto px-6 sm:px-8 lg:px-12 xl:px-14 pt-5 sm:pt-7 pb-6 sm:pb-8">
      <div
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        className="group/hero relative w-full rounded-[32px] sm:rounded-[40px] overflow-hidden min-h-[540px] sm:min-h-[580px] md:min-h-[620px] lg:min-h-[660px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] flex flex-col justify-between bg-[#041226] border border-black/10 select-none"
      >
        {heroSlides.map((slide, index) => (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              activeSlide === index ? "opacity-100 z-0" : "opacity-0 -z-10"
            }`}
          >
            <img src={slide.image} alt="DAVWO Clean Energy Grid" className="w-full h-full object-cover object-center" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#030e1d]/75 via-[#041226]/50 to-[#030e1d]/85" />
          </div>
        ))}

        <div className="relative z-20 w-full pt-8 sm:pt-12" />

        <button
          onClick={prev}
          aria-label="Previous Slide"
          className="absolute left-4 sm:left-7 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white backdrop-blur-md border border-white/20 flex items-center justify-center transition-all cursor-pointer shadow-lg"
        >
          <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
        </button>
        <button
          onClick={next}
          aria-label="Next Slide"
          className="absolute right-4 sm:right-7 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white backdrop-blur-md border border-white/20 flex items-center justify-center transition-all cursor-pointer shadow-lg"
        >
          <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
        </button>

        <div className="relative z-20 max-w-4xl mx-auto px-4 sm:px-6 text-center flex flex-col items-center my-auto py-8">
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[70px] font-bold tracking-tight text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.8)] leading-[1.08]">
            The DAVWO App
          </h1>
          <p className="mt-4 sm:mt-5 text-base sm:text-lg md:text-xl font-normal text-white/90 max-w-2xl mx-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] leading-relaxed">
            A digital marketplace connecting users to clean energy solutions through trusted suppliers. AI-powered matching, and data
            intelligence.
          </p>

          <div className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-4 w-full">
            <button
              onClick={onJoinMarketplace}
              data-testid="hero-join-marketplace"
              className="group rounded-full bg-white hover:bg-neutral-50 active:scale-[0.98] text-neutral-900 font-bold pl-7 pr-2.5 py-2.5 shadow-xl hover:shadow-2xl transition-all duration-200 flex items-center gap-3 cursor-pointer text-sm sm:text-base border border-white"
            >
              <span>Join the Marketplace</span>
              <div className="w-8 h-8 rounded-full bg-[#1b5e3a] group-hover:bg-[#13492c] text-white flex items-center justify-center shrink-0 transition-colors shadow-sm">
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
            <button
              onClick={onBecomeSupplier}
              data-testid="hero-become-supplier"
              className="rounded-full border border-white/25 bg-white/10 hover:bg-white/20 active:scale-[0.98] backdrop-blur-md text-white font-medium px-6 py-3 transition-all duration-200 flex items-center gap-2 cursor-pointer text-sm sm:text-base shadow-md"
            >
              <UserPlus className="w-4 h-4 text-white/90" />
              <span>Become a Supplier</span>
            </button>
          </div>
        </div>

        <div className="relative z-20 pb-6 sm:pb-7 flex items-center justify-center gap-2">
          {heroSlides.map((slide, index) => (
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
      </div>
    </section>
  );
}
