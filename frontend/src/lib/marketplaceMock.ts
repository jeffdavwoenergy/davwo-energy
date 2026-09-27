// Front-end marketplace catalogue (MOCKED — real backend integration to follow).
// Shape + card/detail layout adapted from the attached AutoTrader-style reference,
// re-themed for DAVWO energy products (EV chargers, batteries, solar, services, EVs).

export type MpCategory =
  | "ev-chargers"
  | "battery-solutions"
  | "solar-solutions"
  | "energy-services"
  | "ev-vehicles";

export interface SpecItem {
  label: string;
  value: string;
  icon: string; // maps to SpecIcon in ProductCard
}

export interface ColorOption {
  name: string;
  hex: string;
  image?: string;
}

export interface MpProduct {
  id: string;
  category: MpCategory;
  categoryLabel: string;
  brand: string;
  model: string;
  version: string;
  photosCount: number;
  images: string[];
  baseMonthlyPrice: number;
  baseInitialPayment: number;
  contractMonths: number;
  annualMileage?: number; // vehicles only
  outrightPrice?: number; // hardware buy option
  deliveryEstimate: string;
  deliveryStockNote: string;
  specsGrid: SpecItem[];
  colors?: ColorOption[];
  features: string[];
  detailedSpecs?: Record<string, string>;
  maintenanceCost: number;
  maintenanceLabel: string;
  unitNoun: string; // "miles p/a" for EVs, "units" for hardware
  rating?: number;
  termType: "lease" | "finance" | "subscription";
}

export interface Customization {
  contractType: "personal" | "business";
  color: string;
  annualMileage: number;
  contractMonths: number;
  upfrontMonths: number;
  includeMaintenance: boolean;
  quantity: number;
}

export interface CalculatedPricing {
  monthlyPayment: number;
  initialPayment: number;
  totalPayable: number;
  maintenanceMonthly: number;
  vatLabel: string;
}

const IMG = "/marketplace";

export const CATEGORIES: { id: MpCategory | "all"; label: string; icon: string }[] = [
  { id: "all", label: "All products", icon: "layers" },
  { id: "ev-chargers", label: "EV Chargers", icon: "zap" },
  { id: "battery-solutions", label: "Battery Solutions", icon: "battery" },
  { id: "solar-solutions", label: "Solar Solutions", icon: "sun" },
  { id: "energy-services", label: "Energy Services", icon: "activity" },
  { id: "ev-vehicles", label: "EV Vehicles", icon: "car" },
];

export const MP_PRODUCTS: MpProduct[] = [
  {
    id: "davwo-wallbox-pro",
    category: "ev-chargers",
    categoryLabel: "EV Chargers",
    brand: "Davwo",
    model: "Wallbox Pro",
    version: "7.4kW smart home charger",
    photosCount: 6,
    images: [`${IMG}/ev_charger_wallbox_1790445588036.jpg`, `${IMG}/smart_ev_charger_1790445940135.jpg`, `${IMG}/energy_service_hub_1790445623303.jpg`],
    baseMonthlyPrice: 15,
    baseInitialPayment: 0,
    contractMonths: 36,
    outrightPrice: 799,
    deliveryEstimate: "Certified install in 7–14 days",
    deliveryStockNote: "In stock — free standard home survey & installation",
    specsGrid: [
      { label: "Power", value: "7.4 kW", icon: "zap" },
      { label: "Connector", value: "Type 2 tethered", icon: "plug" },
      { label: "Smart app", value: "iOS & Android", icon: "activity" },
      { label: "Install", value: "OZEV approved", icon: "shield" },
      { label: "Warranty", value: "3 year guarantee", icon: "check" },
      { label: "Load balancing", value: "Dynamic", icon: "home" },
    ],
    features: [
      "Solar-aware charging — top up from your own generation first",
      "Dynamic load balancing protects your main fuse",
      "Schedule off-peak charging from the Davwo app",
      "Weatherproof IP65 enclosure, wall or post mount",
    ],
    detailedSpecs: {
      "Max current": "32 A single phase",
      "Cable length": "5 m tethered",
      Connectivity: "Wi-Fi, 4G, Ethernet",
      Protocol: "OCPP 1.6J",
    },
    maintenanceCost: 6,
    maintenanceLabel: "monitoring & priority support",
    unitNoun: "units",
    rating: 4.6,
    termType: "finance",
  },
  {
    id: "davwo-rapidpoint-50",
    category: "ev-chargers",
    categoryLabel: "EV Chargers",
    brand: "Davwo",
    model: "RapidPoint 50",
    version: "50kW DC rapid charger",
    photosCount: 8,
    images: [`${IMG}/smart_ev_charger_1790445940135.jpg`, `${IMG}/ev_charger_wallbox_1790445588036.jpg`, `${IMG}/energy_service_hub_1790445623303.jpg`],
    baseMonthlyPrice: 240,
    baseInitialPayment: 0,
    contractMonths: 48,
    outrightPrice: 8999,
    deliveryEstimate: "Commissioned in 4–6 weeks",
    deliveryStockNote: "In stock — includes groundworks survey & commissioning",
    specsGrid: [
      { label: "Power", value: "50 kW DC", icon: "zap" },
      { label: "Connectors", value: "CCS + CHAdeMO", icon: "plug" },
      { label: "Protocol", value: "OCPP 1.6", icon: "activity" },
      { label: "Screen", value: '7" touchscreen', icon: "gauge" },
      { label: "Warranty", value: "5 year cover", icon: "check" },
      { label: "Cooling", value: "Active liquid", icon: "shield" },
    ],
    features: [
      "Dual-standard CCS + CHAdeMO for fleet flexibility",
      "Contactless + RFID + app payment ready",
      "Remote diagnostics and OTA firmware via Davwo",
      "Back-office billing and tariff control",
    ],
    detailedSpecs: {
      "Output range": "150–500 V DC",
      "Max current": "125 A",
      Footprint: "Floor-mounted pedestal",
      Certification: "CE, OCPP verified",
    },
    maintenanceCost: 45,
    maintenanceLabel: "service & uptime SLA",
    unitNoun: "units",
    rating: 4.4,
    termType: "finance",
  },
  {
    id: "davwo-powervault-10",
    category: "battery-solutions",
    categoryLabel: "Battery Solutions",
    brand: "Davwo",
    model: "PowerVault 10",
    version: "10kWh home battery",
    photosCount: 7,
    images: [`${IMG}/home_battery_storage_1790445600187.jpg`, `${IMG}/home_battery_pack_1790445951882.jpg`, `${IMG}/smart_energy_meter_1790445982795.jpg`],
    baseMonthlyPrice: 65,
    baseInitialPayment: 0,
    contractMonths: 60,
    outrightPrice: 4499,
    deliveryEstimate: "Certified install in 2–3 weeks",
    deliveryStockNote: "In stock — free home survey & MCS installation",
    specsGrid: [
      { label: "Usable", value: "10 kWh", icon: "battery" },
      { label: "Chemistry", value: "LFP (cobalt-free)", icon: "shield" },
      { label: "Peak output", value: "5 kW", icon: "zap" },
      { label: "Cycles", value: "6,000+", icon: "activity" },
      { label: "Warranty", value: "10 year guarantee", icon: "check" },
      { label: "Backup", value: "Whole-home ready", icon: "home" },
    ],
    features: [
      "Store cheap off-peak and solar energy for evening use",
      "Optional whole-home backup during power cuts",
      "Cobalt-free LFP cells — safer and longer-lasting",
      "Managed by ANI™ to chase the cheapest, cleanest windows",
    ],
    detailedSpecs: {
      "Round-trip efficiency": "95%",
      Scalable: "Up to 30 kWh",
      Depth: "100% usable",
      Certification: "MCS, G99",
    },
    maintenanceCost: 8,
    maintenanceLabel: "monitoring & health checks",
    unitNoun: "units",
    rating: 4.7,
    termType: "finance",
  },
  {
    id: "davwo-powerpack-5",
    category: "battery-solutions",
    categoryLabel: "Battery Solutions",
    brand: "Davwo",
    model: "PowerPack 5",
    version: "5kWh modular battery",
    photosCount: 5,
    images: [`${IMG}/home_battery_pack_1790445951882.jpg`, `${IMG}/home_battery_storage_1790445600187.jpg`],
    baseMonthlyPrice: 38,
    baseInitialPayment: 0,
    contractMonths: 60,
    outrightPrice: 2599,
    deliveryEstimate: "Certified install in 2 weeks",
    deliveryStockNote: "In stock — stackable modular design",
    specsGrid: [
      { label: "Usable", value: "5 kWh", icon: "battery" },
      { label: "Chemistry", value: "LFP", icon: "shield" },
      { label: "Peak output", value: "3.6 kW", icon: "zap" },
      { label: "Expandable", value: "Stack to 20 kWh", icon: "activity" },
      { label: "Warranty", value: "10 year guarantee", icon: "check" },
      { label: "Install", value: "Wall or floor", icon: "home" },
    ],
    features: [
      "Start small and stack extra modules as your needs grow",
      "Compact wall-mount design for garages and utility rooms",
      "Seamless pairing with Davwo solar and chargers",
    ],
    detailedSpecs: {
      "Round-trip efficiency": "94%",
      Modules: "1–4 stackable",
      Certification: "MCS, G98",
    },
    maintenanceCost: 6,
    maintenanceLabel: "monitoring & health checks",
    unitNoun: "units",
    rating: 4.5,
    termType: "finance",
  },
  {
    id: "davwo-solarroof-4",
    category: "solar-solutions",
    categoryLabel: "Solar Solutions",
    brand: "Davwo",
    model: "SolarRoof 4.0",
    version: "4kW rooftop array",
    photosCount: 9,
    images: [`${IMG}/rooftop_solar_panel_1790445967461.jpg`, `${IMG}/solar_panel_array_1790445612561.jpg`, `${IMG}/home_battery_storage_1790445600187.jpg`],
    baseMonthlyPrice: 55,
    baseInitialPayment: 0,
    contractMonths: 60,
    outrightPrice: 5200,
    deliveryEstimate: "Installed in 3–5 weeks",
    deliveryStockNote: "In stock — full MCS design, scaffold & install included",
    specsGrid: [
      { label: "System size", value: "4 kWp", icon: "sun" },
      { label: "Panels", value: "10 × 400W mono", icon: "layers" },
      { label: "Inverter", value: "Hybrid 5 kW", icon: "zap" },
      { label: "Annual yield", value: "~3,600 kWh", icon: "activity" },
      { label: "Warranty", value: "25 year panels", icon: "check" },
      { label: "Standard", value: "MCS certified", icon: "shield" },
    ],
    features: [
      "All-black premium monocrystalline panels",
      "Hybrid inverter is battery-ready out of the box",
      "Full design, scaffold, install and DNO paperwork handled",
      "Generation tracked live in your Davwo dashboard",
    ],
    detailedSpecs: {
      "Panel efficiency": "21.3%",
      "Payback period": "~7 years",
      "CO₂ saved": "~0.9 t / year",
      Certification: "MCS, G99",
    },
    maintenanceCost: 7,
    maintenanceLabel: "performance monitoring",
    unitNoun: "systems",
    rating: 4.8,
    termType: "finance",
  },
  {
    id: "davwo-solarfield-comm",
    category: "solar-solutions",
    categoryLabel: "Solar Solutions",
    brand: "Davwo",
    model: "SolarField",
    version: "20kW commercial solar",
    photosCount: 10,
    images: [`${IMG}/solar_panel_array_1790445612561.jpg`, `${IMG}/rooftop_solar_panel_1790445967461.jpg`, `${IMG}/energy_service_hub_1790445623303.jpg`],
    baseMonthlyPrice: 210,
    baseInitialPayment: 0,
    contractMonths: 60,
    outrightPrice: 21000,
    deliveryEstimate: "Delivered in 6–10 weeks",
    deliveryStockNote: "Made to order — full commercial EPC service",
    specsGrid: [
      { label: "System size", value: "20 kWp", icon: "sun" },
      { label: "Panels", value: "48 × 415W", icon: "layers" },
      { label: "Inverter", value: "3-phase 20 kW", icon: "zap" },
      { label: "Annual yield", value: "~18,000 kWh", icon: "activity" },
      { label: "Warranty", value: "25 year panels", icon: "check" },
      { label: "Standard", value: "MCS / commercial", icon: "shield" },
    ],
    features: [
      "Turnkey commercial rooftop or ground-mount design",
      "Optional export-limitation and battery integration",
      "Business rates and tax relief guidance included",
    ],
    detailedSpecs: {
      "Payback period": "~5 years",
      "CO₂ saved": "~4.5 t / year",
      Monitoring: "Per-string analytics",
    },
    maintenanceCost: 30,
    maintenanceLabel: "O&M service contract",
    unitNoun: "systems",
    rating: 4.6,
    termType: "finance",
  },
  {
    id: "davwo-energy-hub",
    category: "energy-services",
    categoryLabel: "Energy Services",
    brand: "Davwo",
    model: "Energy Hub",
    version: "Site energy management service",
    photosCount: 4,
    images: [`${IMG}/energy_service_hub_1790445623303.jpg`, `${IMG}/smart_energy_meter_1790445982795.jpg`, `${IMG}/smart_ev_charger_1790445940135.jpg`],
    baseMonthlyPrice: 120,
    baseInitialPayment: 0,
    contractMonths: 12,
    deliveryEstimate: "Onboarded in 5–7 days",
    deliveryStockNote: "Managed subscription — cancel any time after term",
    specsGrid: [
      { label: "Assets", value: "Unlimited", icon: "layers" },
      { label: "Optimisation", value: "ANI™ automated", icon: "zap" },
      { label: "Reporting", value: "Daily + monthly", icon: "check" },
      { label: "Support", value: "24/7 desk", icon: "shield" },
      { label: "Contract", value: "12 month rolling", icon: "activity" },
      { label: "Onboarding", value: "Guided 7 days", icon: "home" },
    ],
    features: [
      "ANI™ continuously optimises charging, storage and solar across your sites",
      "Automated carbon and cost reporting for stakeholders",
      "Fault detection with proactive alerts and callouts",
      "Dedicated success manager and 24/7 support desk",
    ],
    detailedSpecs: {
      Integrations: "OCPP, Modbus, REST",
      SLA: "99.9% platform uptime",
      Data: "Half-hourly ingestion",
    },
    maintenanceCost: 0,
    maintenanceLabel: "included",
    unitNoun: "sites",
    rating: 4.9,
    termType: "subscription",
  },
  {
    id: "davwo-smart-meter",
    category: "energy-services",
    categoryLabel: "Energy Services",
    brand: "Davwo",
    model: "Smart Meter",
    version: "MID-certified energy meter",
    photosCount: 4,
    images: [`${IMG}/smart_energy_meter_1790445982795.jpg`, `${IMG}/energy_service_hub_1790445623303.jpg`],
    baseMonthlyPrice: 8,
    baseInitialPayment: 0,
    contractMonths: 24,
    outrightPrice: 199,
    deliveryEstimate: "Fitted in 1 week",
    deliveryStockNote: "In stock — certified electrician install",
    specsGrid: [
      { label: "Accuracy", value: "MID Class B", icon: "gauge" },
      { label: "Phases", value: "1 or 3 phase", icon: "zap" },
      { label: "Comms", value: "Wi-Fi + Modbus", icon: "activity" },
      { label: "Resolution", value: "Half-hourly", icon: "check" },
      { label: "Warranty", value: "5 year guarantee", icon: "shield" },
      { label: "Mount", value: "DIN rail", icon: "home" },
    ],
    features: [
      "Circuit-level visibility feeds straight into Davwo analytics",
      "MID-certified for billing and reconciliation",
      "Simple DIN-rail fit alongside your consumer unit",
    ],
    maintenanceCost: 3,
    maintenanceLabel: "monitoring",
    unitNoun: "units",
    rating: 4.3,
    termType: "finance",
  },
  {
    id: "leapmotor-c10-ev",
    category: "ev-vehicles",
    categoryLabel: "EV Vehicles",
    brand: "Leapmotor",
    model: "C10",
    version: "Electric SUV 69.9kWh Design",
    photosCount: 24,
    images: [
      `${IMG}/leapmotor_c10_green_1790439576633.jpg`,
      `${IMG}/leapmotor_interior_cockpit_1790439623839.jpg`,
      `${IMG}/leapmotor_c10_silver_1790439638178.jpg`,
      `${IMG}/leapmotor_c10_black_1790439732452.jpg`,
    ],
    baseMonthlyPrice: 237,
    baseInitialPayment: 2847,
    contractMonths: 36,
    annualMileage: 5000,
    deliveryEstimate: "December 2026 delivery",
    deliveryStockNote: "In stock — free delivery in 4–6 weeks",
    specsGrid: [
      { label: "Fuel", value: "Electric", icon: "zap" },
      { label: "Range", value: "261 miles", icon: "metric" },
      { label: "Body", value: "SUV", icon: "car" },
      { label: "Gearbox", value: "Automatic", icon: "gearbox" },
      { label: "Seats", value: "5 seats", icon: "seats" },
      { label: "Doors", value: "5 doors", icon: "door" },
    ],
    colors: [
      { name: "Jade Green", hex: "#3f6f52", image: `${IMG}/leapmotor_c10_green_1790439576633.jpg` },
      { name: "Metallic Silver", hex: "#c9ccd1", image: `${IMG}/leapmotor_c10_silver_1790439638178.jpg` },
      { name: "Cosmos Black", hex: "#1a1a1c", image: `${IMG}/leapmotor_c10_black_1790439732452.jpg` },
    ],
    features: [
      "69.9 kWh LFP battery with 261-mile WLTP range",
      "Vehicle-to-load (V2L) — power tools or a home from the car",
      '14.6" central display with OTA updates',
      "Full ADAS suite with adaptive cruise and lane keep",
    ],
    detailedSpecs: {
      "0–62 mph": "7.5 seconds",
      "Top speed": "106 mph",
      Battery: "69.9 kWh LFP",
      "Boot capacity": "581 litres",
      "Insurance group": "28E",
      Warranty: "3 yr / 60k miles",
    },
    maintenanceCost: 30,
    maintenanceLabel: "maintenance plan",
    unitNoun: "miles p/a",
    rating: 3.8,
    termType: "lease",
  },
  {
    id: "byd-sealion-7-ev",
    category: "ev-vehicles",
    categoryLabel: "EV Vehicles",
    brand: "BYD",
    model: "Sealion 7",
    version: "Performance AWD 82.5kWh",
    photosCount: 20,
    images: [`${IMG}/byd_sealion7_blue_1790439685164.jpg`, `${IMG}/leapmotor_interior_cockpit_1790439623839.jpg`, `${IMG}/omoda_7_silver_1790439612804.jpg`],
    baseMonthlyPrice: 349,
    baseInitialPayment: 4188,
    contractMonths: 36,
    annualMileage: 5000,
    deliveryEstimate: "November 2026 delivery",
    deliveryStockNote: "In stock — free delivery in 4–6 weeks",
    specsGrid: [
      { label: "Fuel", value: "Electric", icon: "zap" },
      { label: "Range", value: "312 miles", icon: "metric" },
      { label: "Body", value: "SUV Coupé", icon: "car" },
      { label: "Gearbox", value: "Automatic", icon: "gearbox" },
      { label: "Seats", value: "5 seats", icon: "seats" },
      { label: "Doors", value: "5 doors", icon: "door" },
    ],
    colors: [{ name: "Atlantis Blue", hex: "#2b4f7e", image: `${IMG}/byd_sealion7_blue_1790439685164.jpg` }],
    features: [
      "Dual-motor AWD, 0–62 in 4.5s",
      "82.5 kWh Blade battery with 150 kW rapid charging",
      "Heat pump for efficient winter range",
    ],
    detailedSpecs: {
      "0–62 mph": "4.5 seconds",
      "Top speed": "134 mph",
      Battery: "82.5 kWh Blade",
      "Boot capacity": "500 litres",
      Warranty: "6 yr / 93k miles",
    },
    maintenanceCost: 34,
    maintenanceLabel: "maintenance plan",
    unitNoun: "miles p/a",
    rating: 4.1,
    termType: "lease",
  },
  {
    id: "renault-4-etech-ev",
    category: "ev-vehicles",
    categoryLabel: "EV Vehicles",
    brand: "Renault",
    model: "4 E-Tech",
    version: "Electric 52kWh Techno",
    photosCount: 18,
    images: [`${IMG}/renault_4_red_1790439719222.jpg`, `${IMG}/leapmotor_interior_cockpit_1790439623839.jpg`, `${IMG}/vw_polo_silver_1790439649775.jpg`],
    baseMonthlyPrice: 219,
    baseInitialPayment: 2628,
    contractMonths: 36,
    annualMileage: 5000,
    deliveryEstimate: "January 2027 delivery",
    deliveryStockNote: "In stock — free delivery in 6–8 weeks",
    specsGrid: [
      { label: "Fuel", value: "Electric", icon: "zap" },
      { label: "Range", value: "247 miles", icon: "metric" },
      { label: "Body", value: "Hatchback", icon: "car" },
      { label: "Gearbox", value: "Automatic", icon: "gearbox" },
      { label: "Seats", value: "5 seats", icon: "seats" },
      { label: "Doors", value: "5 doors", icon: "door" },
    ],
    colors: [{ name: "Bilberry Red", hex: "#7a1f2b", image: `${IMG}/renault_4_red_1790439719222.jpg` }],
    features: [
      "Retro-modern design with 52 kWh battery",
      "Up to 100 kW DC rapid charging",
      "Compact footprint, generous cabin space",
    ],
    detailedSpecs: {
      "0–62 mph": "8.2 seconds",
      "Top speed": "93 mph",
      Battery: "52 kWh",
      Warranty: "5 yr / 100k miles",
    },
    maintenanceCost: 26,
    maintenanceLabel: "maintenance plan",
    unitNoun: "miles p/a",
    rating: 4.0,
    termType: "lease",
  },
];

export function getProduct(id: string): MpProduct | undefined {
  return MP_PRODUCTS.find((p) => p.id === id);
}

export function formatGBP(value: number, decimals = 0): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function calcPricing(p: MpProduct, c: Customization): CalculatedPricing {
  const termFactor =
    c.contractMonths === 24 ? 1.0 : c.contractMonths === 36 ? 1.1923 : c.contractMonths === 48 ? 1.285 : 1.36;

  // Keep total roughly constant as upfront months change (baseline = 12 upfront).
  const refDenominator = c.contractMonths - 1 + 12;
  const currentDenominator = c.contractMonths - 1 + c.upfrontMonths;
  const upfrontAdjustment = refDenominator / currentDenominator;

  // Mileage only applies to vehicles.
  const mileageDiff = p.annualMileage ? Math.max(0, c.annualMileage - 5000) : 0;
  const mileageFactor = 1 + (mileageDiff / 5000) * 0.085;

  let effectiveMonthly = p.baseMonthlyPrice * termFactor * upfrontAdjustment * mileageFactor;

  // Snap to the advertised "from" price at the baseline configuration.
  if (c.upfrontMonths === 12 && c.contractMonths === p.contractMonths && (!p.annualMileage || c.annualMileage === 5000)) {
    effectiveMonthly = p.baseMonthlyPrice;
  }

  const qty = Math.max(1, c.quantity || 1);
  const vatMultiplier = c.contractType === "business" ? 1 / 1.2 : 1;
  const baseRate = effectiveMonthly * vatMultiplier * qty;

  const maintenanceMonthly = c.includeMaintenance ? p.maintenanceCost * vatMultiplier * qty : 0;
  const finalMonthly = Math.round((baseRate + maintenanceMonthly) * 100) / 100;
  const initialPayment = Math.round(baseRate * c.upfrontMonths * 100) / 100;
  const totalPayable = Math.round((initialPayment + (c.contractMonths - 1) * finalMonthly) * 100) / 100;

  return {
    monthlyPayment: finalMonthly,
    initialPayment,
    totalPayable,
    maintenanceMonthly: Math.round(maintenanceMonthly * 100) / 100,
    vatLabel: c.contractType === "business" ? "ex. VAT" : "inc. VAT",
  };
}
