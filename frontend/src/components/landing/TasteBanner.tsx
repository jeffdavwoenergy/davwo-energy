"use client";

import { Sparkles } from "lucide-react";

/** Energy-industry brands for the logo rows. Icons are from Simple Icons
 * (CC0, simpleicons.org), saved in public/landing/brands so nothing loads
 * from a third party at runtime; the trademarks belong to their owners.
 * `wordmark` logos already spell the name, so they show alone at their
 * natural width (the value is their width:height ratio — their SVGs are
 * cropped to the outline); the rest are icons shown beside the name. */
type Brand = { slug: string; name: string; wordmark?: number };
const ROW_ONE: Brand[] = [
  { slug: "tesla", name: "Tesla" },
  { slug: "siemens", name: "Siemens", wordmark: 6.05 },
  { slug: "schneiderelectric", name: "Schneider Electric" },
  { slug: "generalelectric", name: "GE" },
  { slug: "shell", name: "Shell" },
  { slug: "nationalgrid", name: "National Grid", wordmark: 4.85 },
  { slug: "polestar", name: "Polestar" },
];
const ROW_TWO: Brand[] = [
  { slug: "panasonic", name: "Panasonic", wordmark: 6.53 },
  { slug: "lg", name: "LG", wordmark: 2.27 },
  { slug: "samsung", name: "Samsung", wordmark: 6.54 },
  { slug: "huawei", name: "Huawei" },
  { slug: "hitachi", name: "Hitachi", wordmark: 6.19 },
  { slug: "mitsubishi", name: "Mitsubishi" },
  { slug: "bosch", name: "Bosch" },
];

const maskOf = (slug: string) => `url(/landing/brands/${slug}.svg) center / contain no-repeat`;

function LogoRow({ brands, direction }: { brands: Brand[]; direction: "left" | "right" }) {
  return (
    <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <ul
        className={`flex w-max py-2 ${direction === "left" ? "animate-marquee-left" : "animate-marquee-right"} group-hover:[animation-play-state:paused] motion-reduce:animate-none`}
      >
        {/* Rendered twice for a seamless loop; the copy is hidden from screen readers. */}
        {[...brands, ...brands].map((b, i) => (
          <li key={`${b.slug}-${i}`} aria-hidden={i >= brands.length} className="flex shrink-0 items-center gap-3 pr-12 sm:pr-16 text-slate-500 transition-colors hover:text-slate-900">
            {b.wordmark ? (
              <span
                role="img"
                aria-label={b.name}
                // Wide wordmarks are short so their letters match the
                // other names; LG's face + letters gets a taller box.
                className={`bg-current ${b.wordmark < 3 ? "h-9 sm:h-11" : "h-5 sm:h-7"}`}
                style={{ aspectRatio: b.wordmark, mask: maskOf(b.slug), WebkitMask: maskOf(b.slug) }}
              />
            ) : (
              <>
                <span className="h-8 w-8 sm:h-10 sm:w-10 bg-current" style={{ mask: maskOf(b.slug), WebkitMask: maskOf(b.slug) }} aria-hidden />
                <span className="text-base sm:text-xl font-semibold tracking-tight whitespace-nowrap">{b.name}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TasteBanner() {
  return (
    <section className="w-full relative bg-white py-14 sm:py-[72px] md:py-24 select-none overflow-hidden">
      <div className="relative z-20 max-w-3xl md:max-w-4xl mx-auto px-4 sm:px-6 md:px-8 text-center">
        <div className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] sm:text-xs font-semibold uppercase tracking-wider mb-2.5 sm:mb-3.5 border border-emerald-200">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>The Sustainable Lifestyle</span>
        </div>
        <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight leading-tight sm:leading-snug">
          Developing a Taste for Clean Energy.
        </h2>
        <p className="mt-2.5 sm:mt-3.5 text-xs sm:text-sm md:text-base text-slate-600 max-w-xl md:max-w-2xl mx-auto leading-relaxed">
          Join thousands of homes, commercial enterprises, and farms transitioning to decentralized, affordable renewable power.
        </p>
      </div>

      <div className="relative mt-8 sm:mt-12 space-y-5 sm:space-y-7">
        <LogoRow brands={ROW_ONE} direction="left" />
        <LogoRow brands={ROW_TWO} direction="right" />
      </div>
    </section>
  );
}
