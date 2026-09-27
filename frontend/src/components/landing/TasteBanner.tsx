"use client";

import { Sparkles } from "lucide-react";

export function TasteBanner() {
  return (
    <section className="w-full relative bg-white py-14 sm:py-[72px] md:py-24 lg:py-28 overflow-hidden select-none min-h-[260px] sm:min-h-[300px] md:min-h-[340px] flex items-center justify-center">
      <div className="absolute inset-0 bg-gradient-to-r from-[#22d3ee] via-[#10b981] to-[#059669] opacity-95" />

      <div className="absolute inset-0 opacity-20 pointer-events-none mix-blend-overlay">
        <svg className="w-full h-full object-cover" viewBox="0 0 1440 360" fill="none" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,140 C320,240, 480,60, 800,180 C1120,300, 1280,120, 1440,160 L1440,360 L0,360 Z" fill="white" />
          <path d="M0,200 C240,100, 600,260, 960,140 C1200,60, 1360,220, 1440,180 L1440,360 L0,360 Z" fill="white" opacity="0.6" />
        </svg>
      </div>

      <div className="absolute top-0 left-0 right-0 h-12 sm:h-16 md:h-20 bg-gradient-to-b from-white via-white/80 to-transparent pointer-events-none z-10" />
      <div className="absolute top-0 left-0 right-0 pointer-events-none z-10 overflow-hidden leading-none">
        <svg viewBox="0 0 1440 60" fill="none" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-6 sm:h-9 md:h-12">
          <path d="M0,0 L1440,0 L1440,15 C1150,55 850,5 450,45 C220,65 80,30 0,22 Z" fill="#ffffff" />
        </svg>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-12 sm:h-16 md:h-20 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none z-10" />
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-10 overflow-hidden leading-none">
        <svg viewBox="0 0 1440 60" fill="none" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-6 sm:h-9 md:h-12">
          <path d="M0,45 C350,10 750,58 1100,22 C1260,6 1380,30 1440,38 L1440,60 L0,60 Z" fill="#ffffff" />
        </svg>
      </div>

      <div className="relative z-20 max-w-3xl md:max-w-4xl mx-auto px-4 sm:px-6 md:px-8 text-center">
        <div className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-white/20 backdrop-blur-md text-white text-[11px] sm:text-xs font-semibold uppercase tracking-wider mb-2.5 sm:mb-3.5 shadow-sm border border-white/30">
          <Sparkles className="w-3.5 h-3.5 text-amber-200" />
          <span>The Sustainable Lifestyle</span>
        </div>
        <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)] leading-tight sm:leading-snug">
          Developing a Taste for Clean Energy.
        </h2>
        <p className="mt-2.5 sm:mt-3.5 text-xs sm:text-sm md:text-base text-white/95 max-w-xl md:max-w-2xl mx-auto font-normal drop-shadow-[0_1px_3px_rgba(0,0,0,0.25)] leading-relaxed">
          Join thousands of homes, commercial enterprises, and farms transitioning to decentralized, affordable renewable power.
        </p>
      </div>
    </section>
  );
}
