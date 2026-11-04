// Device-platform integrations Davwo can connect to, with the assessment of
// each one's access model (auth, permissions, cost, test data). Runtime-free
// so the Settings/Assets UIs can render it client-side.
//
// Assessed November 2026 from each provider's public developer docs — pricing
// and access terms change, so re-check the linked docs before any commercial
// commitment. Only "live" providers have a working connector in this codebase;
// the rest are documented here so the order of work is explicit.

import type { AssetType } from "@/lib/assetSpecs";

export type IntegrationProviderId =
  | "victron_vrm"
  | "solaredge"
  | "enphase"
  | "tesla_fleet"
  | "tesla_energy"
  | "geotab"
  | "ocpp"
  | "ocpi";

/** live = connector built and validated end-to-end against real data;
 * next = the agreed next connector once credentials are in hand;
 * planned = assessed, not started. */
export type IntegrationReadiness = "live" | "next" | "planned";

export interface IntegrationProvider {
  id: IntegrationProviderId;
  name: string;
  vendor: string;
  assetTypes: AssetType[];
  readiness: IntegrationReadiness;
  docsUrl: string;
  auth: string;
  permissions: string;
  cost: string;
  testData: string;
  /** Whether it fits Davwo's current serverless (Vercel + Supabase) stack as-is. */
  fit: string;
  /** Credential fields the connect form asks for (live connectors only). */
  credentialFields?: { key: string; label: string; secret: boolean; help: string }[];
  /** Live connectors that can be tried against the provider's public demo data. */
  demoAvailable?: boolean;
}

export const INTEGRATION_PROVIDERS: IntegrationProvider[] = [
  {
    id: "victron_vrm",
    name: "Victron VRM",
    vendor: "Victron Energy",
    assetTypes: ["EV Charger", "Battery", "Solar"],
    readiness: "live",
    docsUrl: "https://vrm-api-docs.victronenergy.com/",
    auth: "Personal access token (created by the site owner in VRM → Preferences → Integrations), sent as X-Authorization: Token. A public demo account needs no credentials.",
    permissions: "Read-only access to every installation the token's user can see. Diagnostics and alarm-log endpoints need installation admin rights.",
    cost: "Free. Fair-use rate limits apply; Davwo syncs at most every 5 minutes per connection.",
    testData: "Yes. VRM's public demo account has real, live installations, including a site with 10 EV Charging Stations, ESS battery/solar systems and an off-grid site.",
    fit: "Good fit: plain HTTPS polling, works from Vercel serverless functions with no extra infrastructure.",
    credentialFields: [
      { key: "token", label: "VRM access token", secret: true, help: "VRM → Preferences → Integrations → Access tokens. Read-only use." },
    ],
    demoAvailable: true,
  },
  {
    id: "solaredge",
    name: "SolarEdge Monitoring API",
    vendor: "SolarEdge",
    assetTypes: ["Solar", "Battery"],
    readiness: "next",
    docsUrl: "https://developer.solaredge.com/",
    auth: "API key, generated per site (or per account) by the site admin in the SolarEdge monitoring portal.",
    permissions: "Read-only monitoring: site details, power/energy history, inverter and storage telemetry.",
    cost: "Free with a SolarEdge monitoring account. Limited to about 300 requests per day per key/site, so polling must be throttled.",
    testData: "No public sandbox. A customer (or Davwo's own install) must issue a site API key.",
    fit: "Good fit: simple REST polling. The daily request cap means syncing every 15 minutes, not every 5.",
  },
  {
    id: "enphase",
    name: "Enphase Enlighten API v4",
    vendor: "Enphase Energy",
    assetTypes: ["Solar", "Battery"],
    readiness: "planned",
    docsUrl: "https://developer-v4.enphase.com/",
    auth: "OAuth 2.0 authorisation code flow (each system owner approves Davwo's app) plus an application API key.",
    permissions: "Read-only system telemetry: production, consumption, battery state and device inventory, for systems whose owners have authorised the app.",
    cost: "Free entry-level developer plan with low monthly request limits; commercial (partner) plans are paid. Confirm current tiers with Enphase.",
    testData: "No public demo system. Needs a real Enlighten system owner to authorise the app.",
    fit: "Fits, but needs an OAuth redirect route and token refresh on Davwo's domain.",
  },
  {
    id: "tesla_energy",
    name: "Tesla Fleet API: Energy",
    vendor: "Tesla",
    assetTypes: ["Battery", "Solar"],
    readiness: "planned",
    docsUrl: "https://developer.tesla.com/docs/fleet-api/endpoints/energy",
    auth: "OAuth 2.0 (third-party app registered at developer.tesla.com) plus a public key hosted on Davwo's domain under /.well-known/.",
    permissions: "energy_device_data scope for Powerwall/Solar live status and history; energy_cmds to change modes (not needed for monitoring).",
    cost: "Pay-per-use billing on the Fleet API, with a small monthly free allowance. Budget per request.",
    testData: "No sandbox. Needs a Tesla account with a Powerwall or Tesla Solar.",
    fit: "Fits, but needs app registration, domain verification and an OAuth callback first.",
  },
  {
    id: "tesla_fleet",
    name: "Tesla Fleet API: Vehicles",
    vendor: "Tesla",
    assetTypes: ["Vehicle"],
    readiness: "planned",
    docsUrl: "https://developer.tesla.com/docs",
    auth: "Same OAuth 2.0 app as Tesla Energy. Vehicle commands also need a virtual key paired in each car.",
    permissions: "vehicle_device_data for SoC, range and charging state; vehicle_location for position (privacy review needed).",
    cost: "Pay-per-use; frequent polling of vehicle data is the main cost driver. Prefer Fleet Telemetry streaming at scale.",
    testData: "No sandbox. Needs real Tesla vehicles.",
    fit: "Polling fits Vercel. Fleet Telemetry (streaming) needs an always-on server outside Vercel.",
  },
  {
    id: "geotab",
    name: "Geotab MyGeotab API",
    vendor: "Geotab",
    assetTypes: ["Vehicle"],
    readiness: "planned",
    docsUrl: "https://developers.geotab.com/myGeotab/introduction/",
    auth: "Username, password and database name. Authenticate returns a session id for later JSON-RPC calls. Use a dedicated read-only service user.",
    permissions: "Controlled by the service user's MyGeotab security clearance: devices, trips, StatusData (EV SoC, charging), faults.",
    cost: "API access is free, but every vehicle needs a Geotab GO device and a reseller subscription.",
    testData: "Geotab issues free demo databases to registered developers, with simulated vehicles.",
    fit: "Good fit: JSON-RPC over HTTPS, polling from serverless. Use GetFeed for incremental sync.",
  },
  {
    id: "ocpp",
    name: "OCPP 1.6J / 2.0.1",
    vendor: "Open Charge Alliance",
    assetTypes: ["EV Charger"],
    readiness: "planned",
    docsUrl: "https://openchargealliance.org/protocols/ocpp-protocols/",
    auth: "Chargers connect to Davwo's central system (CSMS) over WebSocket. Authentication is per-charger: Basic Auth or TLS client certificates (Security Profiles 1–3).",
    permissions: "Full control: Davwo becomes the charger's back office (status, meter values, start/stop, smart-charging profiles).",
    cost: "Open protocol, no licence fee. Costs are hosting an always-on WebSocket server.",
    testData: "Open-source charge-point simulators work for testing; real chargers must be re-pointed at Davwo's CSMS URL.",
    fit: "Does not fit Vercel as-is: it needs persistent WebSocket connections. Plan a small always-on service under Davwo's own account, writing into the same Supabase database.",
  },
  {
    id: "ocpi",
    name: "OCPI 2.2.1",
    vendor: "EVRoaming Foundation",
    assetTypes: ["EV Charger"],
    readiness: "planned",
    docsUrl: "https://github.com/ocpi/ocpi",
    auth: "Peer-to-peer token exchange (credentials handshake: Token A → B → C) with each roaming partner or hub.",
    permissions: "Agreed per partnership: locations, sessions, CDRs and tariffs from charge-point operators.",
    cost: "Protocol is free. Partner and hub agreements (direct CPO links, or hubs like Hubject or Gireve) may carry fees.",
    testData: "Only through a partner's test environment once an agreement exists.",
    fit: "Fits technically (REST both ways), but it's a commercial integration, so do it after OCPP.",
  },
];

export function providerById(id: string): IntegrationProvider | undefined {
  return INTEGRATION_PROVIDERS.find((p) => p.id === id);
}
