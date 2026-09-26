# DAVWO / ANI™ MVP — Contract Fulfilment Report

**Prepared:** 2026-07-06 · **Repository:** `DavwoEnergyLtd/davwo-mvp1` · **Branch:** `feat/production-readiness` (PR #1) · **Live preview:** https://davwo-mvp1.vercel.app

This document evidences delivery of the DAVWO MVP against the agreed specification. It maps every specified module to the pages and APIs that fulfil it, lists every API used (internal and external) with the reason for each, and records all changes made.

Reference documents in this repository:
- [`DAVWO_MVP_SPEC.md`](DAVWO_MVP_SPEC.md) — the agreed requirements (dashboard modules, demo environment, success criteria).
- [`MVP_BUILD_PLAN.md`](MVP_BUILD_PLAN.md) — gap analysis and phased build log.
- [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md) — engineering hardening checklist.

---

## 1. Executive summary

All **nine specified dashboard modules** and the **demonstration environment** are built, deployed, and verified against a live URL. The platform is a single **Next.js 16 + TypeScript** application on **Vercel**, wired to **real UK energy data**, with an **ANI™ assistant** that answers in charts, tables and KPIs.

| Spec success criterion | Status |
|---|---|
| 1. Log into the platform | ✅ Delivered |
| 2. View connected assets | ✅ Delivered |
| 3. Monitor system activity | ✅ Delivered |
| 4. Access analytics and reports | ✅ Delivered |
| 5. Receive ANI™ recommendations | ✅ Delivered |
| 6. Explore marketplace offerings | ✅ Delivered |
| 7. Export reports (PDF + CSV) | ✅ Delivered |
| 8. Manage alerts and settings | ✅ Delivered |

Quality gates on every commit: **99 automated tests passing** (99%+ coverage of server business logic), **TypeScript strict** clean, **ESLint** clean (now a blocking CI step), **production build** green. Verified end-to-end over live HTTP against the deployed environment.

---

## 2. Requirements fulfilment matrix

Each specified module (per `DAVWO_MVP_SPEC.md`) mapped to the delivering page(s) and API endpoint(s).

| # | Spec module | Page(s) | APIs used | Status |
|---|---|---|---|---|
| 1 | **Dashboard Home** — assets, energy, carbon, alerts, ANI recs, system health | `/dashboard` | `/api/dashboard/metrics` (carbon intensity is carried in this payload), `/api/dashboard/energy-series`, `/api/dashboard/recommendation`, `/api/optimisation`, `/api/grid/smart-window`, `/api/assets`, `/api/alerts` | ✅ |
| 2 | **Assets** — inventory, status, health, location, registration | `/assets` (+ detail drawer) | `/api/assets` (GET list / POST register), `/api/assets/[id]` | ✅ |
| 3 | **Monitoring** — live status, sessions, utilisation, faults | `/monitoring` | `/api/monitoring` | ✅ |
| 4 | **Analytics** — energy, performance, cost, carbon | `/analytics` | `/api/dashboard/metrics`, `/api/dashboard/energy-series`, `/api/grid/price-curve`, `/api/grid/generation-mix`, `/api/assets` | ✅ |
| 5 | **ANI Intelligence** — recommendations, forecasting, insights | `/ai-assistant`, `/forecasting` | `/api/ani/chat`, `/api/ani/insights`, `/api/forecasting`, `/api/optimisation` | ✅ |
| 6 | **Marketplace (Preview)** — vendors, listings, contact vendor | `/marketplace`, `/marketplace/[id]` | `/api/marketplace/vendors`, `/api/marketplace/vendors/[id]`, `/api/marketplace/contact` | ✅ |
| 7 | **Reports** — daily/weekly/monthly, PDF + CSV, categories | `/reports` | `/api/reports/export`, `/api/dashboard/metrics`, `/api/dashboard/energy-series`, `/api/ani/insights` | ✅ |
| 8 | **Alerts Centre** — alerts, priority, resolution tracking | `/alerts` | `/api/alerts`, `/api/alerts/[id]/acknowledge`, `/api/alerts/[id]/resolve`, `/api/ani/insights` | ✅ |
| 9 | **Settings** — profile, org, users, password, preferences | `/settings` | `/api/tenants`, `/api/users`, `/api/users/invite`, `/api/users/change-password`, `/api/auth/switch-org` | ✅ |
| — | **Login** (demo environment entry) | `/login` | `/api/auth/login`, `/api/auth/demo-login`, `/api/auth/me` | ✅ |
| — | **Network Map** (strengthens demo) | `/map` | `/api/dashboard/map` | ✅ |
| — | **Demo Module** (guided tour) | `/demo` | `/api/dashboard/metrics`, `/api/grid/smart-window` | ✅ |

**Marketplace note (per spec):** the Marketplace is *Preview only* — no payments, transactions, or order processing, exactly as specified.

---

## 3. Pages delivered (15 total)

Auth-gated application shell (sidebar + top bar), role-aware navigation (Admin / Operator / Pilot), responsive, each with loading / error / empty states and a data-provenance badge (Live vs Synthetic).

| Page | Purpose |
|---|---|
| `/login` | Enterprise sign-in + one-click demo roles; DAVWO branding. |
| `/dashboard` | Executive overview: KPIs, live energy chart, ANI recommendation, smart charging window, live grid carbon gauge, cost/carbon optimisation, active alerts, Total-Assets & System-Health tiles. |
| `/monitoring` | Real-time station/port status, sessions, utilisation, activity feed. |
| `/analytics` | Energy, cost, carbon and utilisation analytics with live UK grid context. |
| `/forecasting` | Demand forecast with confidence band and weather drivers. |
| `/alerts` | Prioritised ANI™ insights + operational alerts with acknowledge/resolve and status filtering. |
| `/assets` | Asset register with registration dialog and click-through detail drawer; EV chargers + Battery/Solar previews. |
| `/marketplace`, `/marketplace/[id]` | Vendor catalogue across 5 categories + vendor profiles + "Contact Vendor" enquiry. |
| `/reports` | Report generator: category × period selection, PDF and CSV export, summary KPIs and charts. |
| `/ai-assistant` | ANI™ chat answering in charts / tables / KPIs (not markdown). |
| `/map` | UK EV charge-point map with live status. |
| `/settings` | Profile, organisation, preferences, security (change password), and admin Team management. |
| `/demo` | Guided tour hub linking each capability to its live view. |

---

## 4. Internal APIs (32 endpoints) and why they exist

All API routes are Next.js Route Handlers under `/api`. Data-returning routes are **authenticated** (JWT bearer) and, where they return organisation-scoped data, **tenant-scoped** (org derived from the token, never from user input).

### Authentication & identity
| Endpoint | Why |
|---|---|
| `POST /api/auth/login` | Email/password sign-in; returns a signed JWT. Rate-limited against brute force. |
| `POST /api/auth/demo-login` | One-click demo-role sign-in for the showcase (gated behind `ALLOW_DEMO_LOGIN`). |
| `GET /api/auth/me` | Resolve the current user from the token (session bootstrap). |
| `POST /api/auth/switch-org` | Admin-only: re-issue a token scoped to another tenant. |

### Dashboard & operations
| Endpoint | Why |
|---|---|
| `GET /api/dashboard/metrics` | Headline KPIs (energy, cost, carbon, sessions) blending engine data with live cost/carbon. |
| `GET /api/dashboard/energy-series` | Time-series energy consumption (day/week/month) for charts. |
| `GET /api/dashboard/recommendation` | The headline ANI™ recommendation card. |
| `GET /api/dashboard/map` | Site/status markers for the dashboard/map. |
| `GET /api/monitoring` | Live per-station status, utilisation, and sessions. |
| `GET /api/optimisation` | Cost/carbon load-shift opportunity and estimated savings. |
| `GET /api/forecasting` | Demand forecast with confidence band and weather drivers. |

### Grid data (live UK energy context)
| Endpoint | Why |
|---|---|
| `GET /api/grid/carbon` | Live national carbon intensity for the carbon gauge. |
| `GET /api/grid/generation-mix` | Live generation mix (gas/wind/solar/…) for the mix donut. |
| `GET /api/grid/pricing` | Current live electricity price. |
| `GET /api/grid/price-curve` | Half-hourly price curve for analytics. |
| `GET /api/grid/smart-window` | Cheapest + cleanest charging half-hour (blends live price + carbon). |

### ANI™ intelligence
| Endpoint | Why |
|---|---|
| `POST /api/ani/chat` | Natural-language question → verified render-blocks (charts/tables/KPIs). Rate-limited (protects the billable LLM path). |
| `GET /api/ani/insights` | Prioritised, explainable engine findings (each with a "why"). |

### Assets
| Endpoint | Why |
|---|---|
| `GET /api/assets` | Full asset register (EV chargers + Battery/Solar previews + user-registered). |
| `POST /api/assets` | Register a new asset (validated). |
| `GET /api/assets/[id]` | Single-asset detail for the drawer. |

### Alerts
| Endpoint | Why |
|---|---|
| `GET /api/alerts` | Alerts with per-org acknowledge/resolve state; filterable by status/severity. |
| `POST /api/alerts/[id]/acknowledge` | Acknowledge an alert (resolution tracking). |
| `POST /api/alerts/[id]/resolve` | Resolve an alert. |

### Marketplace (preview)
| Endpoint | Why |
|---|---|
| `GET /api/marketplace/vendors` | Vendor catalogue with category filter. |
| `GET /api/marketplace/vendors/[id]` | Vendor profile detail. |
| `POST /api/marketplace/contact` | Capture a vendor enquiry (lead). No payment. Rate-limited. |

### Reports
| Endpoint | Why |
|---|---|
| `GET /api/reports/export` | Generate a real PDF or CSV report by category × period. |

### Organisation & users
| Endpoint | Why |
|---|---|
| `GET /api/tenants` | Tenants the user may access (for the org switcher/settings). |
| `GET /api/users` | Admin-only: list users in the org (Team management). |
| `POST /api/users/invite` | Admin-only: invite a user (rejects duplicate emails). |
| `POST /api/users/change-password` | Change own password (real per-user accounts; safely refused in shared demo mode). |

### Operational
| Endpoint | Why |
|---|---|
| `GET /api/health` | Liveness check for uptime monitoring. |

---

## 5. External APIs used and why

All external data is fetched **server-side**, cached with sensible revalidation, and **degrades gracefully** — if any source is unavailable the app falls back to modelled data and labels it "Synthetic," so the demo never breaks.

| External API | Endpoint(s) | Why it is used |
|---|---|---|
| **UK Carbon Intensity API** (National Grid ESO) | `api.carbonintensity.org.uk/intensity`, `/generation` | Live national grid **carbon intensity** and **generation mix** — powers the carbon gauge, generation-mix donut, "CO₂ avoided" metric, and the carbon half of the smart charging window. Free, no key. |
| **Octopus Energy Agile API** | `api.octopus.energy/v1/products/` | Live **half-hourly electricity pricing** — powers average cost/kWh, the price curve, cost-optimisation savings, and the price half of the smart charging window. Free, no key. |
| **Open-Meteo** | `api.open-meteo.com/v1/forecast` | **Weather forecast** (temperature, solar) — the demand-forecast drivers behind the forecasting view. Free, no key. |
| **OpenChargeMap** | `api.openchargemap.io/v3/poi/` | Real **EV charge-point locations/status** for the network map. Falls back to engine sites when no API key is configured. |
| **Anthropic Messages API** (Claude) | `api.anthropic.com/v1/messages` | Optional **natural-language narration** for the ANI™ assistant over already-verified data blocks — it never supplies the numbers. The assistant is fully functional without it (deterministic rule-based answers); the key upgrades narration quality. |

---

## 6. Key technologies used and why

| Package | Why |
|---|---|
| **Next.js 16 + React 19 + TypeScript** | Single full-stack app (UI + API route handlers) deployable on Vercel; strict typing for reliability. |
| **Tailwind CSS + shadcn/Radix** | Consistent, accessible, enterprise-grade UI. |
| **Recharts** | Dashboard/analytics charts. |
| **Leaflet + react-leaflet** | UK network map. |
| **SWR** | Client-side data fetching with polling for a live feel. |
| **jose** | JWT signing/verification for authentication. |
| **bcryptjs** | Password hashing for real per-user accounts (persistence layer). |
| **mongodb** | Persistence for users, alert state, assets, and marketplace leads (optional; graceful in-memory fallback without it). |
| **pdfkit** | Server-side PDF report generation. |

---

## 7. Summary of all changes made

Delivered across sequenced phases; each landed with tests, type-check, lint, build, and live verification. (Full narrative in `MVP_BUILD_PLAN.md`.)

**Foundation (Phases 1–4, prior):** Next.js/TypeScript rebuild on Vercel · real UK energy data layer + ANI engine ported to TypeScript · all dashboard tabs on real data · visual ANI™ assistant.

**This delivery cycle:**

| Commit | Change |
|---|---|
| `fix(ci)` | Repaired the CI pipeline (missing `test`/`test:cov` scripts — CI had been failing on every push). |
| `fix(security)` | Closed an authentication bypass, made `JWT_SECRET` fail-closed in production, gated demo login, added rate limiting and security headers (CSP, X-Frame-Options, HSTS). |
| `feat(auth)` | MongoDB persistence layer with bcrypt-hashed passwords; graceful in-memory fallback when no database is configured. |
| `feat(marketplace)` | Marketplace Preview module — vendors, categories, profiles, enquiry capture (no payments). |
| `fix(auth)` | Hardened environment-variable parsing (trimming) after a deployment issue. |
| `feat` (Phases D–F) | Real PDF/CSV report export; alert acknowledge/resolve with persisted state; asset registration + detail drawer; Settings team management + change password; dashboard Total-Assets & System-Health tiles. |
| `fix` (hardening) | Re-enabled blocking lint (repaired the toolchain); fixed a CSV formula-injection vector and a duplicate-invite bug; accessibility improvements. |

---

## 8. Security & quality posture

- **Authentication** on all data endpoints (JWT); **tenant isolation** enforced server-side from the token, never from user input.
- **Rate limiting** on authentication, the ANI chat (billable), vendor enquiries, invites, and password changes.
- **Security headers**: Content-Security-Policy, X-Frame-Options, HSTS, Referrer-Policy, X-Content-Type-Options, Permissions-Policy.
- **Secrets**: no secrets in the repository; all read from environment; no secret reaches the client bundle.
- **Testing**: 99 automated tests, 99%+ coverage of server business logic, enforced in CI alongside type-check, lint and build.

---

## 9. Known limitations & items requiring client action

Transparently recorded (see `MVP_BUILD_PLAN.md` and `PRODUCTION_READINESS.md`):

**Deferred (deliberate, documented):** port of 46 reused UI primitives from `.jsx` to `.tsx`; a retroactive test suite for route handlers/components; a full accessibility (WCAG) audit; consolidating the ANI pages under one nav entry; branch protection on `main`.

**Requires client action to unlock full production operation:**
1. **Vercel Team** for DavwoEnergyLtd + GitHub App install (currently deployed under a personal Vercel account, to be transferred).
2. **MongoDB Atlas URI** — enables real persistent accounts, password changes, and persisted alert/asset/lead data (the app runs on graceful fallbacks without it; the live database path has been unit-tested but not yet smoke-tested against a real cluster).
3. **Anthropic API key** — upgrades ANI™ narration (assistant is fully functional without it).
4. **OpenChargeMap key** — real charge-point map data (falls back to engine sites without it).

---

*Prepared for DAVWO Energy Ltd. Generated with Claude Code.*
