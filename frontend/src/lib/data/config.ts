function flag(name: string, def = "false") {
  return (process.env[name] ?? def).trim().toLowerCase() === "true";
}

export const USE_REAL_DATA = flag("USE_REAL_DATA", "true");

// Platform-cached fetch revalidation window (seconds) for upstream APIs.
export const REVALIDATE = Number(process.env.DATA_REVALIDATE_SECONDS ?? "300");

// OpenChargeMap is a single global charge-point database shared by every
// region (see regions/*.ts, which each pass their own countrycode).
export const OCM_API_KEY = (process.env.OCM_API_KEY ?? "").trim();

// ENTSO-E Transparency Platform personal token (EU day-ahead price +
// generation mix) — obtained manually, see regions/eu.ts.
export const ENTSOE_API_TOKEN = (process.env.ENTSOE_API_TOKEN ?? "").trim();

// EIA (US Energy Information Administration) open-data API key — free,
// instant registration at https://www.eia.gov/opendata/register.php.
export const EIA_API_KEY = (process.env.EIA_API_KEY ?? "").trim();
