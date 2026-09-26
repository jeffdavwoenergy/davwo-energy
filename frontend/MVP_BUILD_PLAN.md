# DAVWO MVP — Build Plan & Gap Analysis

> Spec: [DAVWO_MVP_SPEC.md](DAVWO_MVP_SPEC.md) · Engineering hardening checklist: [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md)
> Branch: `feat/production-readiness` · Date: 2026-07-05

## TL;DR

The app is **~70% of the way to the demo spec** already. Phases 1–4 (Next.js rebuild, real UK energy data, live tabs, visual ANI assistant) are built and working. The MVP spec adds **three genuinely-new capability areas** — a **Marketplace Preview**, **CSV/PDF report export + report types**, and **Alert resolution tracking** — plus fleshing out **Assets** (registration, health scores) and **Settings** (user management). On top of that sit the **security + hardening blockers** already identified in the audit, which must land before this is shown to investors on a public URL.

---

## Spec → Reality map

| Spec module | Status | What exists | Gap to close |
|---|---|---|---|
| **1. Dashboard Home** | 🟢 Built | `/dashboard` — KPIs, live energy chart, recommendation, alerts, carbon gauge, smart-window | Add "Total/Active Assets" + "System Health" KPI tiles explicitly; wire ANI-recs summary count |
| **2. Assets** | 🟢 Built (2026-07-05) | `/assets` + `/api/assets` (GET/POST) + `/api/assets/[id]` — Register-asset dialog, click-through detail drawer (health/load/utilisation/location), Battery/Solar "preview" entries alongside the EV-charger fleet, user-added assets persisted via Mongo when configured | Real per-asset monitoring for Battery/Solar (currently illustrative preview rows, not engine-modelled like EV) |
| **3. Monitoring** | 🟢 Built | `/monitoring` + `/api/monitoring` — live status, sessions, utilisation, activity feed | Explicit **fault detection** surface; online/offline rollup tile |
| **4. Analytics** | 🟢 Built | `/analytics` — energy/cost/carbon/utilisation with live grid context | Add **performance comparison** view; usage **history** range |
| **5. ANI Intelligence** | 🟢 Built | `/ai-assistant` (visual answers) + `/forecasting` + `/api/ani/*` + `/api/optimisation` | **Deferred:** merging into one "ANI Intelligence Centre" nav entry was scoped out — see Phase F notes below |
| **6. Marketplace** | 🟢 Built (2026-07-05) | `/marketplace` + `/marketplace/[id]` + `/api/marketplace/*` — 10 seeded vendors across all 5 categories, category filter, vendor profiles, "Contact Vendor" lead form (Mongo-backed when configured, graceful no-op otherwise). No payments/transactions, per spec. | Real vendor onboarding pipeline (post-MVP; currently curated seed data) |
| **7. Reports** | 🟢 Built (2026-07-05) | `/reports` + `/api/reports/export` — real PDF (pdfkit) + CSV export, daily/weekly/monthly periods, 4 report categories (Energy/Asset/Carbon/ANI) | Custom/ad-hoc date ranges beyond the 3 fixed periods |
| **8. Alerts Centre** | 🟢 Built (2026-07-05) | `/alerts` + `/api/alerts` + `/api/alerts/[id]/acknowledge\|resolve` — status filter tabs, acknowledge/resolve actions, state persisted via Mongo when configured (per-instance in-memory otherwise) | — |
| **9. Settings** | 🟢 Built (2026-07-05) | `/settings` — Team panel (list + invite, admin-only) + Change Password, backed by `/api/users`, `/api/users/invite`, `/api/users/change-password` | Password change is Mongo-only by design (see Phase E notes — demo mode intentionally refuses to avoid locking out the shared demo accounts) |
| **Login / Auth** | 🟢 Secured (2026-07-05) | `/login`, JWT via `jose`, demo roles, Phase A hardening applied | — |

Also present but not a spec nav item: `/map` (EV charge-point map) and `/demo` (guided-tour hub) — keep both; they strengthen the demo narrative.

---

## Cross-cutting blockers (from the audit — must land before public demo)

These are not optional polish; they are open holes on a URL that investors will be given.

1. ✅ **Auth bypass fixed** (2026-07-05) — `withTenant()` now rejects (401) instead of defaulting to `davwo`; `/api/alerts` requires auth; `/api/auth/demo-login` gated behind `ALLOW_DEMO_LOGIN=true`.
2. ✅ **`JWT_SECRET` fail-closed** (2026-07-05) — throws in production if unset, resolved lazily so `next build` is unaffected.
3. ✅ **Rate limiting added** (2026-07-05) — `/api/auth/login`, `/api/auth/demo-login`, `/api/ani/chat`.
4. ✅ **Security headers added** (2026-07-05) — CSP, X-Frame-Options, HSTS, etc. via `next.config.ts`.
5. ✅ **CI fixed** (2026-07-05) — `test`/`test:cov` scripts added, pipeline green again.
6. 🟡 **Persistence wired, not yet live** (2026-07-05) — `src/lib/server/db.ts` + `users.ts` now read/write MongoDB with bcrypt when `MONGODB_URI` is set (graceful fallback to in-memory otherwise). Code-complete and unit-tested against a fake driver; needs a real Atlas URI to smoke-test. Alert resolution and report history still need their own mutation endpoints (Phase D) on top of this.

---

## Build Phases

### Phase A — Secure the foundation (blockers 1–4) — ✅ done 2026-07-05
- Made `withTenant` reject (401) on missing/invalid auth; added auth to `/api/alerts`.
- Gated `/api/auth/demo-login` behind `ALLOW_DEMO_LOGIN=true` (kept for the demo deployment rather than tied to `NODE_ENV`, since it's the login page's "try a demo role" feature).
- Fail-closed `JWT_SECRET` (lazy-resolved, throws in prod if unset, doesn't affect `next build`).
- Added in-memory rate limiting on `/api/auth/login`, `/api/auth/demo-login`, `/api/ani/chat`.
- Added security headers (CSP/X-Frame-Options/HSTS/etc.) — caught and fixed a CSP bug that would've broken the Google Fonts import before it shipped.
- *Exit test passed:* live-verified unauthenticated `/api/assets` and `/api/alerts` both 401, authenticated 200, rate limit trips at request 11.

### Phase B — Persistence layer — ✅ code-complete 2026-07-05, 🟡 pending live Atlas smoke test
Unblocks Alerts resolution, Settings user mgmt, and Report history (their own endpoints are still Phase D/E work — this phase only lays the DB foundation).
- `src/lib/server/db.ts` — serverless-safe Mongo connection singleton (standard cached-client-promise pattern), `isDbConfigured()`/`getDb()` with the same "null when unconfigured → caller falls back" shape as `USE_REAL_DATA`.
- `src/lib/server/password.ts` — bcrypt hash/verify (10 rounds).
- `src/lib/server/users.ts` reworked to be async and Mongo-aware: `ensureSeeded()` idempotently seeds the `users` collection from `DEMO_USERS` (bcrypt-hashed) on first lookup if empty; `findByEmail`/`findByRole`/`findById` read Mongo when configured, else the original in-memory array unchanged. `checkPassword()` bcrypt-compares for Mongo-backed users, plain-compares for the in-memory fallback (identical to pre-Phase-B behaviour).
- Updated `login`/`demo-login`/`me`/`switch-org` routes for the new async signatures.
- Did **not** pre-build `orgs`/`assets`/`vendors`/`report_runs` collections — those belong to Phases C/D/E and would be unused schema built ahead of the features that need them; `getDb()` makes adding them trivial when those phases land.
- **Verified:** 66 tests pass (added coverage for the Mongo-backed path via a fake driver — findOne/countDocuments/insertMany against a plain array, not a real MongoDB), tsc clean, build succeeds, and the in-memory fallback re-confirmed live against the dev server (login/wrong-password both behave identically to pre-Phase-B).
- **Not verified:** a real Atlas connection. Considered `mongodb-memory-server` for a live integration test but skipped it — downloading a ~100MB mongod binary in CI adds real flakiness risk for a driver call sequence that's a few lines of documented boilerplate. Recommend a manual smoke test once a real `MONGODB_URI` is available.

### Phase C — Marketplace Preview (new module #6) — ✅ done 2026-07-05
- `src/lib/server/marketplace.ts` — 10 seeded vendors across all 5 spec categories (EV Chargers, Battery, Solar, Energy Services, Consulting), each with rating/reviews/highlights/region/contact — curated demo data, no real vendor pipeline yet.
- `/marketplace` (nav entry added, all roles) — KPI summary, category filter pills, vendor card grid.
- `/marketplace/[id]` — full profile + "Contact Vendor" lead form (name/email/message, pre-filled from the logged-in user).
- `/api/marketplace/vendors` (list + category filter), `/api/marketplace/vendors/[id]` (detail, 404 on unknown), `/api/marketplace/contact` (POST, rate-limited, validates the vendor exists) — all auth-gated the same way as `/api/auth/me` (plain `getAuth`, not tenant-scoped since the catalogue isn't per-org data).
- Lead capture persists to `vendor_leads` via the Phase B Mongo wiring when `MONGODB_URI` is set; otherwise returns `{ok:true, persisted:false}` — same graceful-degradation shape as everything else, so the demo works either way.
- No payments/transactions, per spec.
- **Verified:** 72 tests pass (10 new, covering the catalogue functions and both the Mongo-backed and no-DB paths of `saveLead`), tsc clean, build succeeds, and live-tested against the dev server — 401 unauthenticated, category filter, vendor detail, 404 on unknown vendor, and a real contact-form submission all confirmed working.

### Phase D — Reports export + Alerts resolution — ✅ done 2026-07-05
- **Reports:** `src/lib/server/reports.ts` — real PDF (pdfkit) + CSV export, 3 periods × 4 categories (Energy/Asset/Carbon/ANI), replacing the `window.print()` stopgap. `/api/reports/export?category=&period=&format=`.
- **Alerts:** `src/lib/server/alertState.ts` + `updateAlertStatus()`/`alertsWithState()` in `providers.ts`. `POST /api/alerts/[id]/acknowledge|resolve`, state Mongo-backed when configured (per-instance in-memory otherwise, same accepted pattern as other module state). Alerts page got a status filter + inline action buttons.
- **Real bug caught during verification, not just unit tests:** pdfkit's bundled `Helvetica.afm` font file couldn't be found at runtime (`ENOENT`) — Next's Server Components bundler virtualizes `__dirname`, breaking pdfkit's internal `fs.readFileSync(path.join(__dirname, ...))` lookup. Unit tests (vitest, unbundled) never caught this; only hit it once I ran the actual dev server and downloaded a real PDF over HTTP. Fixed via `serverExternalPackages: ["pdfkit"]` in `next.config.ts` (the documented Next 15+ fix for exactly this class of issue — `mongodb` is already on Next's default-excluded list, which is why *that* dependency never hit this).
- **Verified:** 96 tests pass, tsc clean, build succeeds. Live-tested every category × format combination over real HTTP (all 4 categories in both CSV and PDF, PDF magic bytes confirmed), alert acknowledge/resolve/404/401 all confirmed, status filter confirmed.

### Phase E — Assets + Settings completion — ✅ done 2026-07-05
- **Assets:** `src/lib/server/assetsStore.ts` (Mongo-backed user-added assets, in-memory fallback) + reworked `providers.assets(orgId)` merging engine EV chargers + illustrative Battery/Solar preview rows + org's user-added assets. `POST /api/assets` (validated), `GET /api/assets/[id]` for the detail drawer. UI: "Add Asset" dialog + click-through Sheet detail drawer.
- **Settings:** `listOrgUsers`/`inviteUser`/`changePassword` added to `users.ts`. `/api/users` (admin-only list), `/api/users/invite` (admin-only, rejects duplicate emails), `/api/users/change-password`. **Deliberate design decision, not a gap:** `changePassword` refuses with a clear 403 when no DB is configured — mutating a shared demo account's password would lock out every other visitor of the same public demo deployment. Only meaningful once Mongo is wired up for real per-user accounts.
- **Verified:** live-tested user list/invite/403-for-non-admin/change-password-refusal, plus asset create/detail/404, all over real HTTP against the dev server.

### Phase F — Demo polish + hardening tail — 🟡 more done 2026-07-06, rest deliberately deferred
- ✅ Dashboard Home: added explicit "Total Assets Connected" + "System Health" KPI tiles, computed from the real `/assets` list (not placeholders).
- ✅ **Blocking lint re-enabled (2026-07-06):** the lint toolchain was actually *broken* — `eslint .` crashed on a `zod/v4/core` subpath because a dead, unused `zod@3.24.4` dependency was too old for `eslint-plugin-react-hooks@7.1.1`. Bumped zod to ^3.25, fixed every resulting lint error/warning (unescaped entity, unused imports, two legitimate `set-state-in-effect` cases scoped-disabled with justification, dead `actionTypes` const), switched the `lint` script from the removed `next lint` to `eslint .`, and made it a **required** CI step (was `next lint || true`).
- ✅ **a11y quick wins (2026-07-06):** made the Assets detail-drawer table rows keyboard-operable (`tabIndex`, Enter/Space `onKeyDown`, `aria-label`, focus ring) — they were mouse-only click handlers — and added `aria-label` to the icon-only alert acknowledge/resolve buttons.
- ✅ **Two real bugs found & fixed in a self-review (2026-07-06), both verified live:**
  - **CSV formula injection** in `reports.ts` `csvEscape`: user-supplied asset names/sites flow into the Asset CSV export; a name like `=HYPERLINK(...)` executed as a formula when opened in Excel/Sheets. Now leading `= + - @ \t \r` on string cells are prefixed with `'` (numbers untouched).
  - **Duplicate-invite hole (in-memory mode):** `findByEmail` only searched `DEMO_USERS`, ignoring `invitedMemoryUsers`, so `inviteUser`'s dup-email check silently passed and the same address could be invited repeatedly. All in-memory lookups now go through a shared `inMemoryUsers()` helper. (Mongo path was always correct.)
- **Deferred — ANI nav consolidation:** merging assistant/forecasting/optimisation/insights into one "ANI Intelligence Centre" nav entry was scoped out. Each already exists as a working, ANI-branded page; forcing them into one is real UI restructuring with regression risk for a naming-only gain. Treat as a deliberate design decision unless a specific UX need drives it.
- **Deferred — 46 shadcn `.jsx` → `.tsx` port:** large, mechanical-but-risky migration across every UI primitive with no automated way to verify all 46 render identically short of a full visual-regression pass. Deserves its own dedicated pass. (Note: blocking lint — previously bundled with this item — is now done independently.)
- **Deferred — comprehensive API-route + component test suite:** everything built this session has real coverage for its `src/lib/server/**` logic (enforced by the coverage config); a retroactive suite for the ~35 route handlers and pre-existing components is a separate, large initiative.
- **Deferred — full a11y audit:** targeted fixes done on this session's new interactive UI (above); a comprehensive WCAG pass across the whole app wasn't done.
- **Deferred — branch protection on `main`:** GitHub governance change affecting the whole team — flagged for an explicit decision rather than flipped unilaterally.
- **Still needs you:** Vercel GitHub App install (blocked earlier on creating a Vercel Team — see PRODUCTION_READINESS.md).

---

## Status: MVP spec functionally complete

All 9 spec modules are built (🟢) as of 2026-07-05. What's left is explicitly-scoped hardening/polish (deferred items above) and infra you need to action (Vercel Team, GitHub App, Atlas URI, Anthropic/OCM keys) — not missing features.

### Phase G — Real self-service signup — ✅ done 2026-07-10
An audit of the full signup-to-connect-assets journey found signup didn't actually work: there was no public signup endpoint, `inviteUser`'s generated temp password was discarded and never delivered (permanently unusable invited accounts), and unrecognised org ids silently fell back to the `davwo` demo tenant instead of failing honestly.
- `src/lib/server/orgs.ts` (new) — dynamic org store (`createOrg`/`findOrg`), same Mongo-with-in-memory-fallback pattern as every other store.
- `src/lib/server/tenants.ts` — `resolveTenant(id)` (async: static tenant → dynamic org → honest hash-seeded fallback, never a silent "davwo") replaces the old static-only lookup for every caller except the synchronous hot path (`tenantSeed`/`currentSeed`), which stays sync via a pure deterministic hash so `context.ts` didn't need touching.
- `src/lib/server/signup.ts` (new) + `POST /api/auth/signup` (rate-limited, validated) — org name + name + email + password → new org, new admin user, JWT, in one step.
- `inviteUser` now actually sends the temp password via the existing Resend integration (`emailed: true`) and only surfaces it in the API response as a fallback when email isn't configured or fails — closing the dead-end-account bug.
- `src/app/signup/page.tsx` (new, public — outside the auth-gated route group) + links from `/` and `/login`.
- **Verified:** 154 tests pass (99.05%/86.76%/100%/100% stmt/branch/func/line, above threshold), tsc clean, lint clean, build succeeds. Live-tested the full loop twice — once against local dev, once against production (`davwo-mvp1.vercel.app`) — signup → login persists → `/auth/me` and `/api/tenants` correctly scoped to the new org only (not the 3 demo tenants) → dashboard shows a uniquely-seeded populated view (never empty) → a real asset can be added via `POST /api/assets` and is correctly scoped to the new org.
- **Note:** the production live-test created a real `"Prod Verify Co"` pilot org — harmless test data, but there's no delete-org endpoint yet to clean it up if that matters later.
- **Deferred:** the existing `/demo/start` wizard (logged-in users generating a synthetic "what-if" workspace under their current org) is unchanged and intentionally separate from this new prospect-facing signup flow.

### Phase H — Postgres/Prisma replaces the never-live Mongo design — ✅ done 2026-08-22
Every "Mongo when configured" mention in Phases B–G above described a design that was code-complete but never actually connected to a live database (see Phase B's own "not yet live" caveat). Per the client's Phase 2 SOW decision (see [PHASE2_BUILD_PLAN.md](PHASE2_BUILD_PLAN.md)), Postgres via **Supabase** + **Prisma** replaces that design outright — this is a full swap, not an addition. `mongodb` is removed from `package.json`; `src/lib/server/db.ts` is deleted.
- `prisma/schema.prisma` — `User`, `Org`, `UserAsset`, `AlertState`, `VendorLead`, `PilotProfile` models. Deliberately **no foreign key** from any `orgId` column to `Org` — static demo tenants (`davwo`, `pilot-mcr`) are never rows in the `orgs` table, so a real FK constraint would break them (same reasoning `tenants.ts`'s `resolveTenant` already encodes).
- `src/lib/server/prisma.ts` — replaces `db.ts`. `isDbConfigured()` now checks `DATABASE_URL`; `getPrisma()` returns a cached `PrismaClient` wired through `@prisma/adapter-pg` (Supabase's pooled connection), or `null` when unconfigured — same "caller falls back to in-memory" contract as before.
- Every store (`users.ts`, `orgs.ts`, `assetsStore.ts`, `alertState.ts`, `marketplace.ts`, `pilot.ts`) rewritten from Mongo's `collection().findOne/insertOne/updateOne/find().toArray()` shape to Prisma's `findUnique/findFirst/findMany/create/createMany/update/upsert`. Behavior is unchanged from the caller's perspective — same graceful in-memory fallback, same function signatures.
- **Prisma 7 specifics worth knowing:** connection URLs live outside `schema.prisma` now — `prisma.config.ts` at the repo root supplies `DIRECT_URL` to the CLI (migrate/introspect), while the app's runtime connection uses `DATABASE_URL` via the driver adapter. `prisma.config.ts` eagerly resolves `env("DIRECT_URL")` and throws if it's entirely unset — even `prisma generate` (which needs zero connectivity) won't run without *some* value there, so a placeholder is required in every environment (`.env.local` locally, `.github/workflows/ci.yml` in CI) until a real Supabase URI exists. `postinstall: prisma generate` was added so a fresh `npm install` always produces a client matching the current schema.
- **Verified:** 154 tests pass (99.13%/86.56%/100%/100%), tsc clean, lint clean, build succeeds (same 44 routes as before). Live-tested the full signup → login → tenant-scoping → asset-creation loop against the dev server on the in-memory fallback (no `DATABASE_URL` yet) — behavior is identical to pre-migration.
- **Not yet done:** a real Supabase project. `DATABASE_URL`/`DIRECT_URL` are still placeholders everywhere; the first `npx prisma migrate dev --name init` against a live database, and the matching Vercel env vars, are still pending real credentials.
