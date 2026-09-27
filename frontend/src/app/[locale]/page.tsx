"use client";
/* eslint-disable @next/next/no-img-element */

import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { DavwoHero } from "@/components/landing/DavwoHero";
import { CleanEnergyCardCarousel } from "@/components/landing/CleanEnergyCardCarousel";
import { PopularListings } from "@/components/landing/PopularListings";
import { TasteBanner } from "@/components/landing/TasteBanner";
import { HowDavwoWorks } from "@/components/landing/HowDavwoWorks";
import { ShowcaseGallery } from "@/components/landing/ShowcaseGallery";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { CLEAN_ENERGY_SLIDES } from "@/components/landing/landingData";

export default function Landing() {
  const router = useRouter();

  const scrollToListings = () => {
    document.getElementById("marketplace-listings")?.scrollIntoView({ behavior: "smooth" });
  };
  const goProducts = () => router.push("/products");
  const goSupplier = () => router.push("/supplier/signup");

  return (
    <div className="min-h-screen bg-white text-neutral-900 flex flex-col">
      {/* NAV — kept identical to the current Davwo landing nav (white-on-navy) */}
      <header className="bg-navy">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/davwo-icon-white.png" alt="DAVWO" className="h-9 w-auto" />
            <span className="font-display font-bold text-2xl tracking-tight text-white">DAVWO</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
              <Link href="/products">Marketplace</Link>
            </Button>
            <Button asChild variant="secondary" className="bg-white/10 text-white hover:bg-white/20">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full flex flex-col">
        <DavwoHero onJoinMarketplace={scrollToListings} onBecomeSupplier={goSupplier} />

        <CleanEnergyCardCarousel slides={CLEAN_ENERGY_SLIDES} onOrderNow={goProducts} onLearnMore={goProducts} />

        <div id="marketplace-listings">
          <PopularListings onSeeMore={goProducts} />
        </div>

        <TasteBanner />

        <HowDavwoWorks onOpenMarketplace={scrollToListings} />

        <ShowcaseGallery onJoinMarketplace={goProducts} />
      </main>

      <LandingFooter onOpenMarketplace={goProducts} onOpenSupplier={goSupplier} />
    </div>
  );
}
