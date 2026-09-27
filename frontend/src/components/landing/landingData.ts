export interface CleanEnergySlide {
  id: string;
  name: string;
  tag: string;
  priceMonthly: string;
  financeTerms: string;
  image: string;
  description: string;
}

export const CLEAN_ENERGY_SLIDES: CleanEnergySlide[] = [
  {
    id: "commercial-megagrid",
    name: "MegaGrid Clean Power",
    tag: "Commercial & Industrial",
    priceMonthly: "$890/mo",
    financeTerms: "Power Purchase Agreement (PPA) | $0 Upfront, 25-Year Production Guarantee, 35% Lower Tariffs.",
    image: "/landing/solar_farm_ground_mount_1790535685410.jpg",
    description:
      "Utility-grade ground & commercial rooftop arrays engineered for high-consumption industrial operations, cold storage, and corporate campuses.",
  },
  {
    id: "residential-ecosystem",
    name: "Home EcoSystem Pro",
    tag: "Residential Solar & Battery",
    priceMonthly: "$129/mo",
    financeTerms: "Clean Energy Loan | $0 Down, 0% APR promotional financing, AI-driven home storage integration.",
    image: "/landing/solar_rooftop_modern_home_1790535700825.jpg",
    description:
      "Monocrystalline sleek all-black rooftop panels with AI load-balancing smart inverter and whole-home blackout protection.",
  },
  {
    id: "agrisolar-farm-grid",
    name: "AgriPower Farm Grid",
    tag: "Agricultural & Off-Grid",
    priceMonthly: "$340/mo",
    financeTerms: "Rural Clean Energy Grant & Equipment Lease | 100% autonomous energy independence for irrigation & cold chain.",
    image: "/landing/davwo_hero_clean_energy_1790535621526.jpg",
    description:
      "Rugged, dual-purpose agricultural solar installations providing continuous water pumping, crop shade optimization, and clean power.",
  },
];
