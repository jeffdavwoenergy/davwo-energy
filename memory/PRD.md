# Davwo MVP — Product Requirements & Status

## Overview
Davwo is an "Augmented Network Intelligence (ANI™)" energy-management platform: monitors, analyses,
predicts, recommends and optimises EV chargers, batteries, solar and grid assets. Stack: **Next.js 16 +
React 19** frontend, **FastAPI** backend (reverse-proxy + LLM shim), running on an **in-memory** data
fallback (Prisma bypasses DB when `DATABASE_URL` is absent). Frontend served as a **production build**
(`next build && next start`) — dev mode causes preview-host hydration/cross-origin issues.

User will add Supabase + real supplier auth/listings soon; keep in-memory mock for now.

## Architecture
- `/app/frontend` — Next.js App Router under `src/app/[locale]`. Locale-prefixed routes (`/en/...`).
  - `(app)/*` = authenticated shell (Sidebar + TopBar + FloatingAni), forces light theme.
  - Public routes: `/` (landing, dark navy), `/login`, `/signup`, `/products` (public marketplace).
- `/app/backend/server.py` — FastAPI: reverse-proxies `/api/*` to Next on :3000, plus OpenAI-compatible
  LLM shim using Emergent LLM key (`POST /api/ani/chat`).
- Frontend calls backend via `REACT_APP_BACKEND_URL`.

## Auth
- Demo login: `/login` has 3 role buttons (admin/operator/pilot) → `demoLogin()`. Admin = admin@davwo.com.
- See `/app/memory/test_credentials.md`.

## Implemented (2026-09-27)
- Next.js prod build + FastAPI proxy + LLM shim (Emergent key) — DONE (prior session).
- Dashboard revamp (Bella-style light theme, green hover-glow cards, restructured sidebar) — DONE (prior).
- **AutoTrader-style Marketplace** (this session):
  - Frontend-only mock catalogue: `src/lib/marketplaceMock.ts` (11 products across EV chargers, batteries,
    solar, energy services, EV vehicles) with a live pricing calculator (`calcPricing`).
  - Shared components in `src/components/marketplace/`: `ProductCard`, `MarketplaceFilters`,
    `MarketplaceCatalogue`, `ProductDetailView` (image showcase + thumbnails, "Customise your plan"
    configurator with contract type / colour / mileage / term / upfront / maintenance, live price
    recalculation, order summary, floating+docking price card, gallery & all-specs modals),
    `EnquiryModal` (Start application / Contact us → logs to `localStorage` `davwo_enquiries`), `SpecIcon`,
    `PublicMarketplaceHeader`. Saved products via `src/lib/useSavedProducts.ts` (`davwo_saved_products`).
  - Re-themed AutoTrader blue → Davwo emerald green.
  - **In-app** marketplace: `(app)/marketplace` (catalogue) + `(app)/marketplace/[id]` (detail), in the
    Davwo shell, linked from the sidebar. Replaced the old vendor-list marketplace.
  - **Public** marketplace: `/products` (catalogue) + `/products/[id]` (detail), standalone public header
    + footer, reachable from the landing page. Same components via `basePath` prop.
  - Landing page CTAs "Search products" → **"Marketplace"** (both point to `/products`).
  - Testing agent: in-app marketplace 100% pass (iteration_1.json). Public pages smoke-tested (render +
    navigation OK; reuse identical components).

## Landing page revamp (2026-09-27)
- Rebuilt the public landing page (`src/app/[locale]/page.tsx`, now a client component) to match the
  attached "Davwo clean-energy marketplace & AI matching" repo. New light-theme sections in
  `src/components/landing/`: `DavwoHero` (auto-rotating clean-energy hero), `CleanEnergyCardCarousel`
  (Tesla-style scroll cards), `PopularListings`, `TasteBanner`, `HowDavwoWorks` (4 cards + case-study
  modal), `ShowcaseGallery`, `LandingFooter`. Data in `landingData.ts`; images copied to `public/landing/`.
- **Nav kept EXACTLY the same** as before (white DAVWO logo + Marketplace + Sign in on a navy bar).
- **Popular Marketplace Listings** uses REAL marketplace products (first 4 of `MP_PRODUCTS`) rendered with
  the existing marketplace `ProductCard` (not the repo card style), linking to `/products/{id}`.
- CTAs wired to existing routes: Join/See More/Order Now/Learn More → `/products`; Become a Supplier →
  `/supplier/signup`. (Repo's AI-matcher / listing-detail / auth / supplier modals were NOT ported.)
- Card copy is placeholder from the repo (user will refine later).

## Backlog / Next
- **P1 Landing copy** — user will specify final card/hero copy later.
- **P1 Supplier portal** — supplier login to list products + monitor enquiries/analytics (user plans this).
- **P1 Supabase integration** — move marketplace catalogue + enquiries from mock/localStorage to a real DB.
- **P2** a11y: close gallery/specs modals on Escape (minor, from code review).
- **P2** Wire enquiries into an admin/supplier "enquiries" view (currently localStorage only).

## Known notes
- Two DOM nodes share `pricing-card`/`start-application-btn` testids (one is an invisible docking
  placeholder for the sticky floating card) — target the visible one in tests.
- Marketplace is 100% mock; "Start application"/"Contact us" do not hit any server.
