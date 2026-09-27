"use client";

export function LandingFooter({ onOpenMarketplace, onOpenSupplier }: { onOpenMarketplace: () => void; onOpenSupplier: () => void }) {
  return (
    <footer className="w-full bg-white border-t border-neutral-100 py-12 text-neutral-500 text-xs">
      <div className="max-w-[1280px] mx-auto px-6 sm:px-8 lg:px-12 xl:px-14 text-center space-y-5">
        <p className="max-w-3xl mx-auto text-[11px] text-neutral-400 leading-relaxed">
          The DAVWO App connects consumers and commercial entities with independent, verified clean energy contractors and equipment
          manufacturers. Power Purchase Agreement (PPA) rates, net-metering credits, and incentives vary by jurisdiction and utility
          interconnection tariff. Energy savings calculations are estimates based on regional solar irradiance.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-2 text-neutral-600">
          <span className="font-semibold text-neutral-900">DAVWO App © 2026</span>
          <button onClick={onOpenMarketplace} className="hover:text-emerald-800 transition">Marketplace</button>
          <button onClick={onOpenSupplier} className="hover:text-emerald-800 transition">Become a Supplier</button>
          <button onClick={onOpenMarketplace} className="hover:text-emerald-800 transition">AI Demand Forecast</button>
          <button onClick={onOpenMarketplace} className="hover:text-emerald-800 transition">Trust &amp; Escrow</button>
          <button onClick={onOpenMarketplace} className="hover:text-emerald-800 transition">Privacy &amp; Terms</button>
          <button onClick={onOpenMarketplace} className="hover:text-emerald-800 transition">Sustainability Index</button>
        </div>
      </div>
    </footer>
  );
}
