"use client";
/* eslint-disable @next/next/no-img-element */

import { Sparkles, TrendingUp, CheckCircle, ArrowRight } from "lucide-react";

export function ShowcaseGallery({ onJoinMarketplace }: { onJoinMarketplace: () => void }) {
  const stories = [
    {
      id: 1,
      image: "/landing/davwo_user_cafe_phone_1790535651679.jpg",
      tag: "Residential Solar Owner",
      name: "Marcus Adebayo",
      location: "Austin, TX",
      savings: "$140/mo saved on electricity",
      quote:
        "\u201CThe DAVWO App matched me to a local installer in 10 minutes. My electric bill went from $210 down to practically zero with net metering credits!\u201D",
      highlight: "Turnkey 6.4kW System",
    },
    {
      id: 2,
      image: "/landing/davwo_user_yellow_headwrap_1790535637382.jpg",
      tag: "Community Microgrid Leader",
      name: "Amina Diallo",
      location: "Atlanta, GA",
      savings: "100% Reliable Off-Grid Power",
      quote:
        "\u201CManaging our cooperative microgrid used to be a headache. With DAVWO data intelligence, our entire neighborhood shares clean solar effortlessly.\u201D",
      highlight: "Community Solar + Battery",
    },
    {
      id: 3,
      image: "/landing/davwo_user_suit_solar_1790535662984.jpg",
      tag: "Commercial Operations Director",
      name: "Julian Sterling",
      location: "San Diego, CA",
      savings: "$48,000 Annual PPA Savings",
      quote:
        "\u201CAs an enterprise with three logistics warehouses, DAVWO simplified our zero-down corporate PPA procurement and gave us real-time ESG metrics.\u201D",
      highlight: "250kW Commercial Array",
    },
  ];

  return (
    <section className="w-full py-16 md:py-24 bg-[#fafafa] border-b border-neutral-200/80">
      <div className="max-w-[1280px] mx-auto px-6 sm:px-8 lg:px-12 xl:px-14">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 sm:mb-12">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Real People, Real Clean Energy</span>
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-neutral-900 tracking-tight">Empowering Homes &amp; Enterprises</h2>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500 mt-2 sm:mt-0 max-w-md">
            See how the DAVWO App creates tangible bill savings and energy sovereignty across communities.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {stories.map((story) => (
            <div
              key={story.id}
              className="group bg-white rounded-2xl overflow-hidden border border-neutral-200/90 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between"
            >
              <div className="aspect-[4/5] sm:aspect-[3/4] bg-neutral-100 overflow-hidden relative">
                <img src={story.image} alt={story.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                <div className="absolute top-4 left-4">
                  <span className="px-3 py-1 rounded-full bg-white/90 backdrop-blur-md text-xs font-bold text-neutral-900 shadow-sm">{story.tag}</span>
                </div>
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <div className="text-lg font-bold drop-shadow-md">{story.name}</div>
                  <div className="text-xs text-white/80">{story.location}</div>
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-600/90 backdrop-blur-md text-xs font-semibold text-white">
                    <TrendingUp className="w-3.5 h-3.5 text-white" />
                    <span>{story.savings}</span>
                  </div>
                </div>
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between bg-white space-y-4">
                <p className="text-xs sm:text-sm text-neutral-700 italic leading-relaxed">{story.quote}</p>
                <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
                  <span className="font-semibold text-emerald-800 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    {story.highlight}
                  </span>
                  <button onClick={onJoinMarketplace} className="font-semibold text-neutral-700 hover:text-emerald-700 flex items-center gap-1 cursor-pointer">
                    <span>View System</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
