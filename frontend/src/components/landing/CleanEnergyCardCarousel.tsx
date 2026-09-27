"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useRef, useEffect } from "react";
import type { CleanEnergySlide } from "./landingData";

interface Props {
  slides: CleanEnergySlide[];
  onOrderNow: (slide: CleanEnergySlide) => void;
  onLearnMore: (slide: CleanEnergySlide) => void;
}

export function CleanEnergyCardCarousel({ slides, onOrderNow, onLearnMore }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToSlide = (index: number) => {
    setCurrentIndex(index);
    const container = scrollContainerRef.current;
    if (!container) return;
    const target = container.children[index] as HTMLElement;
    target?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const cardWidth = (container.children[0] as HTMLElement)?.offsetWidth || 1;
      const newIndex = Math.round(container.scrollLeft / (cardWidth + 20));
      if (newIndex >= 0 && newIndex < slides.length && newIndex !== currentIndex) setCurrentIndex(newIndex);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [slides.length, currentIndex]);

  return (
    <section className="relative w-full bg-white pb-12 sm:pb-16 pt-0 overflow-hidden">
      <div className="max-w-[1280px] mx-auto px-6 sm:px-8 lg:px-12 xl:px-14">
        <div
          ref={scrollContainerRef}
          className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth [&::-webkit-scrollbar]:hidden gap-4 sm:gap-5 lg:gap-6 pb-2 -mx-6 sm:-mx-8 lg:-mx-12 xl:-mx-14 px-6 sm:px-8 lg:px-12 xl:px-14"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {slides.map((slide) => (
            <div
              key={slide.id}
              className="snap-start shrink-0 w-[82vw] max-w-[360px] sm:w-[70vw] sm:max-w-[520px] md:w-[68vw] md:max-w-[580px] lg:w-[calc(50%-12px)] lg:max-w-none aspect-[3/3.8] sm:aspect-[4/3.6] md:aspect-[16/11] lg:aspect-[16/10] min-h-[450px] sm:min-h-[480px] md:min-h-[440px] lg:min-h-[420px] relative rounded-2xl overflow-hidden bg-neutral-900 shadow-sm group select-none"
            >
              <img
                src={slide.image}
                alt={slide.name}
                className="w-full h-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-700 ease-out"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/20 pointer-events-none" />

              <div className="absolute top-5 left-5 sm:top-6 sm:left-6 z-10">
                <span className="text-xs sm:text-sm font-semibold text-white/95 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)] tracking-wide">
                  {slide.tag}
                </span>
              </div>

              <div className="absolute bottom-5 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6 md:bottom-7 md:left-7 md:right-7 z-10">
                <h3 className="text-2xl sm:text-3xl md:text-4xl lg:text-[42px] font-bold text-white tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] leading-tight">
                  {slide.name}
                </h3>
                <p className="text-sm sm:text-base font-semibold text-white mt-1 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                  Available From {slide.priceMonthly}
                </p>
                <p className="text-[11px] sm:text-xs text-white/80 mt-1 max-w-lg line-clamp-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                  {slide.financeTerms}{" "}
                  <button onClick={() => onLearnMore(slide)} className="underline hover:text-white transition-colors cursor-pointer">
                    Terms apply.
                  </button>
                </p>

                <div className="mt-4 sm:mt-5 grid grid-cols-2 gap-2 sm:gap-3 w-full">
                  <button
                    onClick={() => onOrderNow(slide)}
                    className="w-full py-2.5 sm:py-3 px-3 sm:px-6 bg-[#3e6ae1] hover:bg-[#3457b2] active:scale-[0.98] text-white text-xs sm:text-sm font-semibold rounded-[4px] shadow-sm transition-all text-center cursor-pointer"
                  >
                    Order Now
                  </button>
                  <button
                    onClick={() => onLearnMore(slide)}
                    className="w-full py-2.5 sm:py-3 px-3 sm:px-6 bg-white hover:bg-neutral-100 active:scale-[0.98] text-neutral-900 text-xs sm:text-sm font-semibold rounded-[4px] shadow-sm transition-all text-center cursor-pointer"
                  >
                    Learn More
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToSlide(i)}
              aria-label={`Slide ${i + 1}`}
              className={`transition-all duration-300 rounded-full cursor-pointer w-2 h-2 ${
                i === currentIndex ? "bg-neutral-900" : "bg-neutral-300 hover:bg-neutral-400"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
