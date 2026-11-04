# Device Integrations: Assessment and First Integration

**Date:** 4 November 2026
**Scope:** the nine EV fleet, EV charger, solar and battery APIs and protocols proposed for Davwo, assessed for fit with Davwo's existing stack (Next.js on Vercel, Supabase Postgres via Prisma, the ANI™ dashboard).

## Summary

- **Victron VRM is live in Davwo now**, validated end to end with real data. It's the most practical first integration: free, simple token auth, and it's the only provider with a public demo account serving real, live installations. One connector covers all three stationary asset classes: EV chargers, batteries and solar.
- **SolarEdge is next.** Same polling shape as VRM, free, but each site owner has to issue an API key, and there's a daily request cap.
- **OCPP is the strategic EV charger integration**, but it needs an always-on WebSocket server, which Vercel can't host. It's the only item that needs new infrastructure; plan it as a small service under Davwo's own cloud account, writing into the same Supabase database.
- Tesla (vehicles and energy), Enphase and Geotab all need a customer or developer account before anything can be tested. OCPI needs a commercial roaming partner.

## The nine options

| # | Integration | Assets | Authentication | Permissions | Cost | Test data | Fits current stack? | Status |
|---|---|---|---|---|---|---|---|---|
| 8 | Victron VRM | EV chargers, battery, solar | Personal access token (site owner creates it in VRM) | Read-only on the user's installations | Free (fair-use limits) | **Yes: public demo account, real live sites** | Yes, HTTPS polling | **Live** |
| 5 | SolarEdge Monitoring | Solar, battery | API key per site/account, issued by site admin | Read-only monitoring | Free; ~300 requests/day per key | No sandbox | Yes; sync every 15 min to respect the cap | Next |
| 6, 9 | Enphase Enlighten v4 | Solar, battery | OAuth 2.0 (owner approves Davwo's app) + API key | Read-only system telemetry | Free entry plan with low limits; paid partner tiers | No public demo system | Yes, plus an OAuth callback route | Assessed |
| 7 | Tesla Fleet API: Energy | Powerwall, solar | OAuth 2.0 app + public key hosted on Davwo's domain | `energy_device_data` (read) | Pay-per-use, small monthly allowance | No sandbox | Yes, after app registration and domain verification | Assessed |
| 2 | Tesla Fleet API: Vehicles | Vehicles | Same app; virtual key per car for commands | `vehicle_device_data`, `vehicle_location` | Pay-per-use; polling is the main cost | No sandbox | Polling yes; streaming telemetry needs an always-on server | Assessed |
| 1 | Geotab MyGeotab | Vehicles | Username/password/database → session (JSON-RPC) | Set by the service user's security clearance | API free; GO device + reseller subscription per vehicle | Free developer demo database | Yes, HTTPS polling | Assessed |
| 3 | OCPP 1.6J / 2.0.1 | EV chargers | Chargers connect *to* Davwo over WebSocket (Basic Auth or TLS certificates) | Full back-office control | Open protocol; hosting cost only | Open-source charger simulators | **No:** needs a persistent WebSocket server | Assessed |
| 4 | OCPI 2.2.1 | EV chargers (roaming) | Token exchange with each partner or hub | Agreed per partnership | Partner/hub fees possible | Only via a partner's test environment | Technically yes; commercially gated | Assessed |

Pricing and access terms are as published at the time of review. Re-check the linked docs before any commercial commitment.

## What was built and validated (Victron VRM)

**Real data source.** VRM's public demo account. Three sites were selected as energy infrastructure; the demo's boats and yachts were left out:

| Site | Location | Devices brought into Davwo |
|---|---|---|
| Multiple EV Chargers | Paris | 10 Victron EV Charging Stations, battery (Quattro 10 kVA + Lynx Shunt), solar (3 MPPTs + 3 Fronius inverters) |
| ESS System | Amsterdam | Battery (Pylontech, MultiPlus-II 3 kVA), solar |
| Off-grid | Queensland | Battery (Lynx Smart BMS, Multi RS 6 kVA), solar |

**Data flow:** VRM → Davwo connector → Davwo's database (devices as assets, 30 days of hourly history as readings) → dashboards, alerts, forecasts and Ask ANI™.

**What it showed on the day:**

- Three chargers were drawing power (≈7.4, 7.0 and 4.0 kW).
- **Charger #51 reports "CP input test error (shorted)"**, a real hardware fault. Davwo raised a high-severity alert from the device's own status. Separately, ANI's analysis of 14 days of history flagged the same unit (offline 100% of the time, against under 1% for healthy units).
- The site's average charger utilisation is 9%, which ANI flagged as under-used.
- Battery capacity isn't exposed by VRM to read-only users, so Davwo **estimates it from the battery's own history** (energy charged ÷ state of charge gained): about 10 kWh in Amsterdam and 13 kWh in Queensland.
- Forecast confidence for this account is **backtested on its own history** (67%), not a fixed figure.

**Caveats:**

- The Paris site is a Victron demonstration/test installation. The hardware and telemetry are real, but usage patterns (such as chargers running continuously) are not typical customer behaviour.
- VRM doesn't report battery state of health, cycle counts or inverter DC voltage/temperature. Davwo shows these as "Not reported" instead of estimating them.
- Prices, revenue and carbon use the account's UK market data (Octopus Agile, UK grid carbon), although the sites are in France, the Netherlands and Australia.

## How it fits Davwo's infrastructure and ownership

- **No new services or vendors.** The connector runs inside Davwo's existing Next.js app on Vercel and writes to Davwo's own Supabase database.
- **Credentials:** stored only in Davwo's database, encrypted (AES-256-GCM) with Davwo's own key (`INTEGRATIONS_ENCRYPTION_KEY`). They're never returned by any API, and only admins can add or remove them. The migration creates the credentials table with row-level security enabled, so Supabase's public API key can't read it.
- **Validation before storage:** a token is tested against the provider first; a rejected token is never saved.
- **Ownership:** all code is in Davwo's repository. There's no third-party integration platform in the data path, and disconnecting a platform deletes its devices and readings from Davwo.
- **Freshness:** data is refreshed at most every 5 minutes while the app is in use, served from the last sync while a refresh runs in the background, and refreshed daily by a scheduled job. Hourly is possible on Vercel Pro.

## Recommended next steps

1. **Connect a real Davwo or customer VRM account** with a personal access token (Assets → Connect platform). It's the same connector as the demo.
2. **SolarEdge:** obtain one site API key from a customer or partner install, then build the connector. Same pattern as VRM, roughly a few days of work.
3. **OCPP:** decide where the always-on charger gateway will run, under Davwo's own cloud account, and validate it against a charger simulator before pointing real chargers at it.
4. **Vehicles:** request a Geotab developer demo database (free) to build fleet telematics against simulated vehicles; register the Tesla Fleet API app in parallel if Tesla vehicles are in scope.
