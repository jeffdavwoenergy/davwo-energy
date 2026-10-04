"use client";
/* eslint-disable @next/next/no-img-element */

import { Link } from "@/i18n/navigation";
import { ArrowRight, ArrowLeft, Store, Sparkles, type LucideIcon } from "lucide-react";

const CHOICES: {
  href: string;
  image: string;
  alt: string;
  icon: LucideIcon;
  eyebrow: string;
  title: React.ReactNode;
  copy: string;
  cta: string;
  testId: string;
}[] = [
  {
    href: "/supplier/login",
    image: "/landing/fleet_commercial_truck_charging_1790536590056.jpg",
    alt: "Commercial vehicle charging",
    icon: Store,
    eyebrow: "Supplier Portal",
    title: <>Sign in as a <span className="text-emerald-400">Supplier</span></>,
    copy: "Manage your marketplace listings, plan pricing and buyer enquiries.",
    cta: "Supplier sign in",
    testId: "choose-supplier",
  },
  {
    href: "/login",
    image: "/landing/clean_energy_grid_hero_1790540262882.jpg",
    alt: "Clean energy grid",
    icon: Sparkles,
    eyebrow: "ANI™",
    title: <>Sign in to <span className="text-emerald-400">ANI™</span> Super Intelligence Platform</>,
    copy: "Monitor, forecast and optimise your energy infrastructure with live UK data.",
    cta: "ANI™ sign in",
    testId: "choose-ani",
  },
];

// Sign-in chooser from the landing page: one half per platform, each a full
// photo panel that leads to that platform's own login page.
export default function SignInChooserPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#041226]">
      <div className="relative flex-1 grid md:grid-cols-2">
        {CHOICES.map(({ href, image, alt, icon: Icon, eyebrow, title, copy, cta, testId }) => (
          <Link
            key={href}
            href={href}
            data-testid={testId}
            className="group relative overflow-hidden min-h-[50vh] md:min-h-screen flex items-end md:items-center justify-center text-white"
          >
            <img
              src={image}
              alt={alt}
              className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#030e1d]/75 via-[#041226]/55 to-[#030e1d]/90 transition-colors duration-300 group-hover:from-[#030e1d]/60 group-hover:via-[#041226]/40" />
            <div className="relative z-10 max-w-xl px-8 pb-12 pt-24 md:py-0 text-center flex flex-col items-center">
              <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold mb-5 bg-white/10 border border-white/20 backdrop-blur-md">
                <Icon size={14} /> {eyebrow}
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold leading-tight drop-shadow-[0_2px_16px_rgba(0,0,0,0.8)]">
                {title}
              </h2>
              <p className="mt-4 text-sm sm:text-base text-white/85 drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">{copy}</p>
              <span className="mt-8 rounded-full bg-white text-neutral-900 font-bold pl-6 pr-2 py-2 shadow-xl flex items-center gap-3 text-sm sm:text-base transition-all group-hover:shadow-2xl">
                {cta}
                <span className="w-8 h-8 rounded-full bg-[#1b5e3a] group-hover:bg-[#13492c] text-white flex items-center justify-center transition-colors">
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </span>
            </div>
          </Link>
        ))}

        {/* Brand + way back, floating over both halves */}
        <div className="absolute top-0 inset-x-0 z-20 px-6 sm:px-10 py-6 flex items-center justify-between pointer-events-none">
          <Link href="/" className="pointer-events-auto flex items-center gap-2 text-white">
            <img src="/davwo-icon-white.png" alt="DAVWO" className="h-9 w-auto" />
            <span className="font-display font-bold text-2xl tracking-tight">DAVWO</span>
          </Link>
          <Link href="/" className="pointer-events-auto inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white">
            <ArrowLeft size={15} /> Back to home
          </Link>
        </div>
        <div className="hidden md:block absolute inset-y-0 left-1/2 w-px bg-white/15 z-10" aria-hidden />
      </div>
    </div>
  );
}
