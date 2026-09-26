// Shapes every region's real-data connectors return — shared so uk.ts/us.ts/
// eu.ts (and the registry in regions/index.ts) describe the same contract
// without one region module importing another just for its types.

export interface CarbonData {
  intensity_gco2_kwh: number;
  index: string | null;
  generation_mix: { name: string; share: number }[] | null;
}

export interface CarbonSlot {
  from: string;
  gco2: number;
}

/** Currency-agnostic — a region's own currency, not assumed to be GBP.
 * `price_per_kwh` is the major-unit price (e.g. 0.283), `minor_unit_value`
 * its minor-unit equivalent (e.g. 28.3 pence/cents) for display alongside it,
 * the way UK tariffs are conventionally quoted in pence as well as pounds. */
export interface PricingData {
  price_per_kwh: number;
  currency_symbol: string;
  minor_unit_value: number;
  minor_unit_symbol: string;
  valid_from: string | null;
  product: string;
}

export interface PriceSlot {
  valid_from: string;
  pence: number;
}

export interface MapPin {
  site: string;
  lat: number;
  lng: number;
  status: string;
  active_sessions: number;
}
