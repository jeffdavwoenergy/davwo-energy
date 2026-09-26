# DAVWO / ANI™ — API Connections Report

**Prepared:** 24 September 2026
**Repository:** DavwoEnergyLtd/davwo-mvp1
**Live preview:** davwo-mvp1 (Vercel, production)

This document lists every API the platform connects to — external third-party data/service providers, and the platform's own internal API surface — grouped by purpose, with live production configuration status and, for anything not yet working, exact setup steps.

---

## 1. External APIs — status at a glance

| API | Category | Status | Env var(s) |
|---|---|---|---|
| UK Carbon Intensity API (National Grid ESO) | Energy & Grid Data | 🟢 Live | none (keyless) |
| Octopus Energy Agile API | Energy & Grid Data | 🟢 Live | none (keyless) |
| EIA (US Energy Information Administration) | Energy & Grid Data | 🔴 Not configured | `EIA_API_KEY` |
| ENTSO-E Transparency Platform | Energy & Grid Data | 🔴 Not built + not configured | `ENTSOE_API_TOKEN` |
| Open-Meteo | Weather | 🟢 Live | none (keyless) |
| OpenChargeMap | EV Charge-Point Data | 🔴 Not configured | `OCM_API_KEY` |
| OpenAI (Chat Completions) | AI / LLM Narration | 🟢 Live | `OPENAI_API_KEY` |
| Resend | Email / Notifications | 🔴 Not configured | `RESEND_API_KEY` |

Every connector degrades gracefully with no key set — a missing key never crashes the app, it just means that specific feature falls back to synthetic/no-op behaviour until configured. "Not configured" below means exactly that: the code is real and tested, it just has nothing to call yet in production.

---

## 2. Energy & Grid Data APIs

Per-region connectors live in `src/lib/data/regions/*.ts` — an organisation's `market` field (`uk` / `eu` / `us`) selects which set of these `providers.ts` calls.

### UK Carbon Intensity API (National Grid ESO) — 🟢 Live
- **Endpoint:** `api.carbonintensity.org.uk` (`/intensity`, `/generation`, `/intensity/{date}/fw24h`)
- **Purpose:** Live national grid carbon intensity (gCO2/kWh) and generation fuel mix — powers the carbon gauge, the generation-mix chart, the "CO2 avoided" metric, and the carbon half of the smart-charging window.
- **Auth:** None required — free, public, no key.
- **Used by:** `src/lib/data/regions/uk.ts`

### Octopus Energy Agile API — 🟢 Live
- **Endpoint:** `api.octopus.energy/v1/products/{product}/electricity-tariffs/{tariff}/standard-unit-rates/`
- **Purpose:** Live half-hourly UK electricity pricing — powers average cost/kWh, the price curve, cost-optimisation savings, and the price half of the smart-charging window.
- **Auth:** None required — free, public, no key.
- **Used by:** `src/lib/data/regions/uk.ts`

### EIA — US Energy Information Administration — 🔴 Not configured
- **Endpoint:** `api.eia.gov/v2/` (`electricity/rto/fuel-type-data`, `electricity/retail-sales`)
- **Purpose:** Generation-mix-derived carbon intensity (EIA has no ready-made single figure like the UK's, so it's calculated from published fuel-mix data using standard lifecycle emission factors — disclosed as a derived estimate, not a metered number) and monthly average retail electricity pricing, for organisations with `market: "us"`.
- **Current behaviour without a key:** `fetchCarbonIntensity()` and `fetchPricing()` both return `null` — a `market: "us"` org sees synthetic/fallback data, not real US numbers.
- **Fix — 5 minutes, no waiting period:**
  1. Register at **https://www.eia.gov/opendata/register.php** (instant, free, no approval wait).
  2. Add `EIA_API_KEY=<your key>` in Vercel → Project → Settings → Environment Variables (Production), and in `.env.local` for local dev.
  3. Redeploy (`vercel --prod`) — no code changes needed.
  - Optional overrides (defaults are already sensible): `EIA_RESPONDENT` (default `US48`, national aggregate), `EIA_RETAIL_STATE` (default `US`), `EIA_RETAIL_SECTOR` (default `RES`, residential).

### ENTSO-E Transparency Platform — 🔴 Not built + not configured
- **Endpoint:** ENTSO-E Transparency Platform REST API (day-ahead prices + generation mix, per European bidding zone)
- **Purpose:** The EU-market equivalent of the UK's carbon/pricing connectors — real day-ahead price and generation-mix data for European organisations (`market: "eu"`).
- **Current behaviour:** Two things are missing, not one — there is no `src/lib/data/regions/eu.ts` module yet (an EU-market org's requests are routed to the UK data set as a placeholder fallback), **and** no token is configured even if the module existed.
- **Fix:**
  1. Create an account at **https://transparency.entsoe.eu**.
  2. Email `transparency@entsoe.eu` with subject "RESTful API access" requesting a personal API token — this is a manual approval step, **~3 business days**, and only Nathan/Collins can request it (it needs a real ENTSO-E account holder).
  3. Once the token arrives, set `ENTSOE_API_TOKEN` in Vercel Production + `.env.local`.
  4. Build `src/lib/data/regions/eu.ts` (mirrors `us.ts`'s structure — this is a coding task, separate from the token request, and doesn't need to wait for the token to be written, only to be live-verified).
  - **Action needed now, independent of any code work:** send the token request email if it hasn't been sent yet — it's the single longest lead-time item in this whole report.

---

## 3. Weather

### Open-Meteo — 🟢 Live
- **Endpoint:** `api.open-meteo.com/v1/forecast`
- **Purpose:** Temperature range and peak solar irradiance — feeds the demand-forecast "drivers" shown on `/forecasting` and in ANI's forecast answers. Global coverage, so both the UK and US region modules already share this one connector with their own coordinates.
- **Auth:** None required — free, public, no key.
- **Used by:** `src/lib/data/weather.ts` (shared by `regions/uk.ts` and `regions/us.ts`)

---

## 4. EV Charge-Point / Location Data

### OpenChargeMap — 🔴 Not configured
- **Endpoint:** `api.openchargemap.io/v3/poi/`
- **Purpose:** Real EV charge-point locations and operational status for the Network Map (`/map`) — falls back to the synthetic engine's own station pins when unavailable.
- **Current behaviour without a key:** `fetchChargePoints()` returns `null` unconditionally (unlike the keyless APIs above, this one is coded to require a key, not just work at a reduced rate limit) — every org, UK or US, currently sees the synthetic station map, not real nearby charge points.
- **Fix — free, self-service, a few minutes:**
  1. Register at **https://openchargemap.org** and generate an API key from your account.
  2. Add `OCM_API_KEY=<your key>` in Vercel Production + `.env.local`.
  3. Redeploy — no code changes needed. Works immediately for both UK (`countrycode=GB`) and US (`countrycode=US`) organisations, since it's one shared connector.

---

## 5. AI / LLM Narration

### OpenAI (Chat Completions API) — 🟢 Live
- **Endpoint:** `api.openai.com/v1/chat/completions`
- **Purpose:** Adds natural-language narration over ANI's already-verified data blocks (dashboard summaries, forecast explanations, the forecast-accuracy answer, product Q&A) — it narrates and selects, it never invents the underlying numbers. ANI is fully functional without it: unset, every capability still answers with deterministic, keyword-routed template text.
- **Auth:** `OPENAI_API_KEY`, currently set in Vercel Production.
- **Model:** `OPENAI_MODEL` (default `gpt-5.6-terra`, OpenAI's mid-tier "balanced" model) — not currently overridden in Production, so it's running on the default. Worth a quick check against the OpenAI dashboard that this model id is still correct/available, since it was picked after this assistant's own knowledge cutoff.
- **Used by:** `src/lib/server/llm.ts` (single shared client — replaced three near-duplicate call sites across `assistant.ts` and `productQA.ts`).
- **Note:** the platform previously used Anthropic's Claude for this same role; it was fully migrated to OpenAI and no Anthropic code paths remain.

---

## 6. Email / Notifications

### Resend — 🔴 Not configured
- **Purpose:** All transactional/notification email — procurement-enquiry notifications, invite-flow credentials, proactive asset-fault alerts, the on-demand digest, and scheduled PDF reports (the daily cron job).
- **Current behaviour without a key:** Every email path runs in a documented graceful no-op mode — built, tested, and silently doing nothing in production. No crashes, no queued/lost mail, just nothing sent.
- **Fix:**
  1. Create an account at **https://resend.com** (only Nathan or Collins can do this — it's an account-creation step, not something achievable via CLI/code access).
  2. Generate an API key, add `RESEND_API_KEY=<your key>` in Vercel Production + `.env.local`.
  3. Optionally verify a sending domain and set `EMAIL_FROM=DAVWO ANI <alerts@yourdomain.com>` — without this it defaults to Resend's shared test sender (`onboarding@resend.dev`), which only delivers to the Resend account's own email address, not real customers.
  - **This is the platform's single most-widely-blocked feature** — five separate email flows are all waiting on this one key.

---

## 7. Internal Platform API Surface

Everything below is the platform's own code — no external dependency, all live and working in production today. Grouped by function, not exhaustively described per-endpoint (65 routes in total). All paths are relative to `/api/`.

**Authentication & Identity** — customer sign-in, one-click demo roles, session bootstrap, self-service signup, admin org-switching.
auth/login, auth/demo-login, auth/me, auth/signup, auth/switch-org

**Supplier Authentication** — a fully separate account/JWT model from customer auth, so a supplier session can never be confused with a customer session.
supplier/auth/login, supplier/auth/me, supplier/auth/signup

**Dashboard & Operations** — headline KPIs, time-series charts, live station status/faults, cost/carbon optimisation, demand forecasting.
dashboard/metrics, dashboard/energy-series, dashboard/recommendation, dashboard/map, monitoring, monitoring/faults, optimisation, forecasting

**Grid Data** — direct pass-throughs of the live carbon/pricing data from Section 2, shaped for specific charts/widgets.
grid/carbon, grid/generation-mix, grid/pricing, grid/price-curve, grid/smart-window

**ANI™ Intelligence** — natural-language Q&A, prioritised explainable findings, proactive daily briefing, backtested forecast-accuracy reporting.
ani/chat, ani/insights, ani/briefing, ani/forecast-accuracy

**Assets** — asset register (register/edit/delete), single + CSV-batch telemetry ingestion.
assets, assets/[id], assets/[id]/readings, assets/import, assets/readings/import

**Alerts** — operational alert feed with per-org acknowledge/resolve state.
alerts, alerts/[id]/acknowledge, alerts/[id]/resolve

**Marketplace — Customer side** — vendor/product discovery, AI-grounded product Q&A, enquiry capture, procurement state (new → responded → accepted/declined).
marketplace/vendors, marketplace/vendors/[id], marketplace/products, marketplace/products/[id], marketplace/contact, marketplace/ask, marketplace/leads, marketplace/leads/[id]

**Marketplace — Supplier side** — supplier self-service: product catalogue, technical documents, per-product knowledgebase, lead management.
marketplace/suppliers, marketplace/suppliers/[id], marketplace/products/[id]/documents (+[docId]), marketplace/products/[id]/knowledgebase, supplier/products, supplier/products/[id]/documents, supplier/products/[id]/knowledgebase, supplier/leads, supplier/leads/[id]

**Analytics & Reports** — period-over-period comparison analytics, PDF/CSV report generation.
analytics/summary, reports/export

**Organisation, Users & Settings** — org profile, team management, role changes, invites, password changes, per-user preferences.
org, tenants, users, users/[id], users/invite, users/change-password, users/preferences

**Notifications** — in-app notification feed, on-demand email digest.
notifications, notifications/email

**Pilot Onboarding** — ROI-estimate generation from a stated infrastructure profile.
pilot/onboard

**Ops / Infrastructure** — liveness check for uptime monitoring; daily scheduled report emails (guarded by CRON_SECRET).
health, cron/reports

---

## 8. Summary — what needs action, and by whom

| Item | Who | Effort | Blocked on |
|---|---|---|---|
| Set `EIA_API_KEY` | Nathan/Collins | ~5 min | Nothing — instant registration |
| Set `OCM_API_KEY` | Nathan/Collins | ~5 min | Nothing — instant registration |
| Set `RESEND_API_KEY` (+ `EMAIL_FROM`) | Nathan/Collins | ~10 min | Account creation only |
| Send the ENTSO-E token request | Nathan/Collins | ~5 min to send | ~3 business days for approval to arrive |
| Build `src/lib/data/regions/eu.ts` | Development | Coding task | Can start now, independent of the token |

Every one of these is additive — none of them require any change to already-shipped, already-tested code paths. Setting a key simply switches that feature from its graceful synthetic/no-op fallback to live data.
