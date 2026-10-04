/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";

/**
 * The photo side of the split sign-in pages (ANI™ and Supplier) — full-bleed
 * image under a navy gradient, Davwo mark top-left, headline in the middle,
 * small print at the bottom. Hidden below lg, where the form goes full width.
 */
export default function AuthImagePanel({
  image,
  alt,
  badge,
  headline,
  subcopy,
  footer,
}: {
  image: string;
  alt: string;
  badge?: ReactNode;
  headline: ReactNode;
  subcopy?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="hidden lg:flex relative overflow-hidden bg-navy text-white">
      <img src={image} alt={alt} className="absolute inset-0 w-full h-full object-cover object-center" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#030e1d]/80 via-[#041226]/55 to-[#030e1d]/90" />
      <div className="relative z-10 flex flex-col justify-between p-12 w-full">
        <div className="flex items-center gap-2">
          <img src="/davwo-icon-white.png" alt="DAVWO" className="h-9 w-auto" />
          <span className="font-display font-bold text-2xl">DAVWO</span>
          {badge}
        </div>
        <div>
          <h2 className="text-4xl font-display font-bold leading-tight max-w-md drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">{headline}</h2>
          {subcopy && <p className="mt-4 text-slate-200 max-w-md drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">{subcopy}</p>}
        </div>
        <div className="text-xs text-slate-300">{footer}</div>
      </div>
    </div>
  );
}
