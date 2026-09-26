# DAVWO / ANI™ — Production Readiness Checklist

Rebuild to a single **Next.js + TypeScript** app on **Vercel**, wired to real UK
energy data, with an ANI™ assistant that answers in **charts/tables**, not text.

Legend: `[x]` done · `[~]` in progress · `[ ]` todo · 🟡 needs you

---

## Phase 1 — Foundation + deploy ✅ (this PR)
- [x] Next 16 (App Router) + React 19 + TypeScript + Tailwind v3 + shadcn + Recharts
- [x] Reuse design tokens + 46 shadcn components verbatim from the old app
- [x] Auth-gated dashboard shell (Sidebar/TopBar) ported to Next routing
- [x] Auth: `jose` JWT route handlers + in-memory demo users (admin/operator/pilot)
- [x] API route handlers: `/api/auth/*`, `/api/dashboard/*`, `/api/alerts`, `/api/health`
- [x] Pages: Landing, Login (demo roles), Dashboard (KPIs + live energy chart + recommendation + alerts)
- [x] `DataSourceBadge` (Live vs Synthetic) — provenance on every data surface
- [x] Placeholder pages for the remaining tabs (navigable shell)
- [x] `npm run build` green (type-checks, 19 routes)
- [x] CI workflow (type-check + build)
- [ ] Vercel project linked → prod=`main`, preview=PRs 🟡 *you install the Vercel GitHub App on `davwoenergy` + import repo*

## Phase 2 — Real data + ANI engine ✅
- [x] `src/lib/data/*`: Carbon Intensity, Octopus Agile, Open-Meteo, OpenChargeMap (`fetch` + `revalidate`)
- [x] Ported the `davwo-ani` engine to `src/lib/ani/*` (monitor/analyse/forecast/recommend/optimise)
- [x] `providers.ts`: overlay real values onto shapes; `USE_REAL_DATA` flag + graceful fallback
- [x] New routes: `/api/grid/{carbon,pricing,generation-mix}`, `/api/forecasting`, `/api/monitoring`, `/api/assets`, `/api/ani/insights`
- [x] MongoDB Atlas wiring: `src/lib/server/db.ts` (serverless-safe connection) + `users.ts` reworked to read/write Mongo with bcrypt-hashed passwords when `MONGODB_URI` is set, graceful fallback to the in-memory demo users otherwise. Code-complete and unit-tested against a fake driver; not yet smoke-tested against a live cluster 🟡 *needs an Atlas URI*
- [x] Persisted alert ack/resolve (2026-07-05) — `POST /api/alerts/[id]/acknowledge|resolve`, Mongo-backed when configured
- [ ] Persisted chat history
- [ ] OpenChargeMap free key (map falls back to engine sites until added) 🟡

## Phase 3 — Tabs, clearer & more informative ✅
- [x] Monitoring, Analytics, Forecasting, Alerts, Assets, Reports built on the real endpoints
- [x] Each: real data · loading/error/empty states · data-source badge · responsive
- [x] Flagship visuals: live generation-mix donut, forecast confidence band, utilisation charts
- [x] Settings (2026-07-05) — Team management (list/invite, admin-only) + change password, backed by real endpoints
- [ ] Demo module — still placeholder

## Phase 4 — ANI assistant (visual answers) ✅ (works now; upgrades with key)
- [x] Render-block contract (`text|kpis|chart|table|insight`) + `RenderBlock` renderer
- [x] Deterministic capability routing over all data sources → real chart/table/KPI answers (no key needed)
- [x] Chat UI rendering charts/tables/KPIs inline (not markdown); suggested prompts
- [x] LLM narration auto-enables when `OPENAI_API_KEY` is set (via `fetch`, never invents numbers) 🟡 *key optional*
- [ ] Streamed responses + persistent chat history (needs Atlas)

## Phase 5 — Hardening + go-live
- [x] Security review (2026-07-05) — full audit + fixes: auth bypass closed, JWT fail-closed, rate limiting, security headers (see MVP_BUILD_PLAN.md Phase A)
- [x] Rate-limit auth (2026-07-05) — `/api/auth/login`, `/api/auth/demo-login`, `/api/ani/chat`, plus `/api/marketplace/contact`, `/api/users/invite`, `/api/users/change-password`
- [x] Demo creds disabled-by-default in prod (2026-07-05) — `ALLOW_DEMO_LOGIN` gate, off unless explicitly set
- [x] Blocking lint re-enabled (2026-07-06) — fixed the broken toolchain (dead `zod` dep was too old for `eslint-plugin-react-hooks`), cleared all lint errors/warnings, switched `lint` script to `eslint .`, and made it a required CI step (was `next lint || true`)
- [ ] Tests: Vitest + RTL (per tab) + Playwright happy-path E2E — `src/lib/server/**` business logic is well-covered (99%+); API routes and React components still have zero dedicated tests (deliberately deferred, see MVP_BUILD_PLAN.md Phase F)
- [ ] Port the 46 shadcn `.jsx` components to `.tsx` (deliberately deferred — large mechanical migration, own dedicated pass)
- [ ] a11y pass (deliberately deferred)
- [ ] Branch protection on `main` (CI + 1 review) — governance decision, flagged for explicit sign-off rather than done unilaterally

---

### Needs you 🟡 (all optional — the app runs without them)
1. **Vercel** — install the Vercel GitHub App on `davwoenergy` + import the repo; I set env (`JWT_SECRET`, `USE_REAL_DATA=true`) + verify deploys.
2. **Anthropic API key** — upgrades the ANI assistant from rule-based to Claude narration.
3. **MongoDB Atlas URI** — real auth + persistence (Phase 2/5).
4. **OpenChargeMap key** — real EV charge-point map: https://openchargemap.org
