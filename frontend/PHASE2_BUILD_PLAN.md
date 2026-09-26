# DAVWO / ANI™ — Phase 2 Build Plan (Client SOW)

> Status: **planning — no build work started.** This maps the Phase 2 SOW (sections A–E below) onto
> what already exists from the MVP build (see [MVP_BUILD_PLAN.md](MVP_BUILD_PLAN.md)) and sequences
> the net-new work. Nothing here has been built yet — this is the plan to review before Stage 1 starts.
>
> **Architecture decision (2026-08-19): staying unified on Vercel — no Hetzner split for now.**
> Hetzner was an initial assumption, not a client/contract requirement, so it got re-examined on
> merit rather than taken as given. At the project's current stage (early pilot, low traffic, no
> confirmed real-time hardware-telemetry requirement), everything the SOW's "Backend Development"
> bucket asks for — API dev, DB integration, auth, reporting/analytics — is already served fine by
> the existing Next.js app on Vercel. A dedicated server buys nothing at this scale and costs real,
> permanent ops overhead (patching, TLS, uptime, its own deploy pipeline) that Vercel currently
> absorbs for free; Vercel's usage-based pricing is also very likely cheaper than an always-on box
> that's mostly idle at this traffic level.
>
> **Revisit this decision if any of these become concretely true**, not hypothetically:
> - Real customer hardware needs persistent connections (WebSockets/MQTT) for live telemetry —
>   serverless functions are a poor fit for long-lived connections.
> - A background job (e.g. nightly recommendation recomputation across many tenants) needs to run
>   longer than Vercel's function duration allows.
> - The client asks for infrastructure independent of Vercel for compliance/data-residency reasons.
>
> Until one of those is real, Phase 2 stays a single Next.js deployable, same as the MVP build.

---

## SOW scope (as given)

| Bucket | Includes |
|---|---|
| **A. Frontend Development** | Approved platform interfaces · customer dashboard · marketplace interface · user account functionality · responsive web app · frontend perf |
| **B. Backend Development** | API development/integration · database integration · authN/authZ · backend marketplace functionality · reporting/analytics services · system integration · platform services |
| **C. ANI™ Development Support** | Data integration · analytics functionality · recommendation-engine integration · monitoring integration · platform intelligence features |
| **D. Marketplace Development** | Supplier onboarding · product catalogue · marketplace backend services · customer enquiry/procurement workflows · marketplace administration |
| **E. Testing & Deployment** | Bug ID/resolution · functional testing · integration testing · perf optimisation · deployment support · technical documentation |

**Product goal driving all of it:** let non-technical users analyse, compare, recommend, and optimise between energy systems — with those systems eventually being sourced from the marketplace being built here. So D (marketplace) and C (ANI recommendation engine) have to converge: ANI's recommendations should be able to point at real marketplace listings, not just generic advice.

---

## What already exists (from the MVP build) vs what's net-new

| SOW bucket | Already built (MVP) | Net-new for Phase 2 |
|---|---|---|
| **A. Frontend** | Dashboard shell, Monitoring/Analytics/Forecasting/Reports/Alerts/Settings tabs, responsive layout, marketplace *preview* UI (browse/filter/contact-vendor) | Real marketplace UI (supplier profiles, product catalogue browsing/comparison, enquiry/procurement flow, order-ish status tracking); user account functionality beyond login (profile, org settings, billing-adjacent screens if any); perf pass once real backend round-trips replace same-origin Next API calls |
| **B. Backend** | Auth (JWT), user/org management, Prisma/Postgres persistence pattern (schema + every store already ported — see MVP_BUILD_PLAN.md Phase H), ~35 Next.js route handlers, rate limiting, security headers | A live Supabase database (schema and client code are done, but nothing has connected to a real instance yet); reporting/analytics as a first-class queryable service (today it's PDF/CSV export only); backend marketplace functionality (Stage 4) |
| **C. ANI support** | ANI engine (`src/lib/ani/*`): monitor/analyse/forecast/recommend/optimise, visual-answer assistant, all driven by *synthetic + free public data sources* | Recommendation engine wired to **real marketplace listings** (today `recommendedPartners` in the pilot-onboarding flow points at categories, not real vendor records); real monitoring-integration (live telemetry ingestion from actual customer assets, not just public grid/weather data); "platform intelligence" beyond the current chat assistant (e.g. proactive insights surfaced without being asked) |
| **D. Marketplace** | Marketplace **Preview only** (10 seeded vendors, browse/filter/contact-form lead capture) — explicitly scoped as preview-only in the MVP spec, no payments/transactions | Everything else: supplier onboarding (a supplier-facing signup/listing-management flow — doesn't exist), product catalogue (structured products under each supplier, not just vendor profiles), procurement workflow (enquiry → quote → accept, some kind of state machine), marketplace admin (moderate suppliers/listings, resolve disputes) |
| **E. Testing & deployment** | CI (lint/tsc/test/build) on push, `test:cov` with enforced thresholds on `src/lib/server` + `src/lib/ani`, live-verification-before-shipping as standing practice | Test coverage extended to the new marketplace/ANI-integration endpoints; load/perf testing under realistic marketplace traffic; a real Atlas cluster in the loop instead of the in-memory fallback |

---

## Sequenced stages

Numbered independently of the MVP build's "Phase A–G" — this is Phase 2 of the client SOW, a separate track.

### Stage 1 — Backend foundation for real persistence + reporting (blocks C, D)
- **Decided and implemented (2026-08-22):** Postgres via Supabase + Prisma, replacing the never-live MongoDB design entirely — see MVP_BUILD_PLAN.md Phase H. `prisma/schema.prisma` already models `User`, `Org`, `UserAsset`, `AlertState`, `VendorLead`, `PilotProfile`; every store in `src/lib/server/*` already speaks Prisma. This closes out most of what this stage originally scoped.
- **Still outstanding:** an actual Supabase project. `DATABASE_URL`/`DIRECT_URL` are placeholders everywhere (`.env.local`, CI, and Vercel still needs them added) — nothing has connected to a live database yet. Once real credentials exist: fill them in, run `npx prisma migrate dev --name init` once, and add both vars to Vercel.
- Data model for marketplace entities (suppliers, products, enquiries) needed by Stage 4 still needs designing — Postgres's relational model (foreign keys between suppliers→products→enquiries) fits this more naturally than the document-shaped stores already in the schema, so expect a few new relational models alongside the existing ones, not a wholesale rethink.
- Turn reporting/analytics into a proper queryable API surface (today it's PDF/CSV export only) if Stage 4's marketplace admin or Stage 3's platform intelligence need to query aggregates rather than generate a document.
- **Exit criteria:** signup → login → tenant-scoped data works against a live Supabase database (not just the in-memory fallback), with the same test suite passing against it.

### Stage 2 — Dashboard/marketplace UI (A)
- Build the real marketplace interface: supplier profile pages backed by real listings, product catalogue browsing with comparison (this is where "help non-technical users compare systems" becomes literal UI, not just ANI chat), enquiry/procurement flow UI.
- User account functionality beyond login/change-password (profile, org details editing — some of this may already partially exist in Settings and just needs extending).
- Responsive + frontend perf pass across the new marketplace screens.

### Stage 3 — ANI integration support (C)
- Data integration: bring in real per-customer asset telemetry (today ANI only has public grid/weather/tariff data plus synthetic per-org seeds — real monitoring integration means ingesting actual customer system data once assets are connected).
- Recommendation-engine integration with the real marketplace: when ANI recommends "you need more battery storage," that recommendation should resolve to actual marketplace listings (real product/supplier records from Stage 4's data model), not a static category link like today's pilot-onboarding flow.
- Monitoring integration: define what "connecting assets" means for real hardware (webhook ingestion? polling an integrator API? manual entry?) — this needs a decision, it's a genuine unknown today.
- Platform intelligence features: proactive surfacing (e.g. "ANI noticed X" without being asked), building on the existing chat-based assistant.

### Stage 4 — Marketplace backend (D)
- Supplier onboarding: a supplier-facing flow to register, submit listings, get approved (this is new — today all 10 vendors are seeded/curated, no self-service path exists).
- Product catalogue: structured product records per supplier (spec fields per category — kW rating, price, lead time, etc.), not just the current freeform vendor-profile text.
- Procurement workflow: enquiry → response → accept/decline, some persisted state machine (today "Contact Vendor" is a one-shot lead-capture form with no follow-up state).
- Marketplace administration: an admin surface to moderate suppliers/listings, handle disputes, feature/unfeature listings.

### Stage 5 — Testing & deployment (E)
- Integration/functional tests for every new endpoint and flow added in Stages 2–4, held to the same coverage-threshold discipline as the existing `src/lib/server` suite.
- Performance/load testing once real marketplace traffic patterns exist (concurrent enquiries, catalogue browsing) — still against the single Vercel deployment, so this is about query/render performance, not multi-service load balancing.
- Deployment stays the current `vercel --prod` flow (see [davwo-mvp1-project memory] for the manual-deploy note — there's still no GitHub↔Vercel auto-deploy wired up).
- Technical documentation update: data model diagram for the new marketplace entities, environment/secrets inventory.

**Dependency shape:** Stage 1 blocks Stage 3 and Stage 4 (both need the live Atlas cluster and, for Stage 4, its data model). Stage 2 can start in parallel with Stage 1 for anything that's pure UI/mock-data work, but real marketplace screens need Stage 4's data. Stage 5 is continuous (testing alongside each stage, not just at the end).

---

## Open questions (need answers before Stage 4 starts)

1. ~~Database for real persistence~~ — **decided: Postgres via Supabase + Prisma** (2026-08-22). See Stage 1 and MVP_BUILD_PLAN.md Phase H.
2. **What does "connecting assets" mean for real customers?** — webhook ingestion from third-party monitoring hardware, a polling integration, manual data entry, or CSV import (there's already a CSV import path for assets in the MVP — may be a starting point)? This affects Stage 3's scope significantly and isn't answerable from the SOW text alone. This is also the question whose answer would reopen the Hetzner question (see banner at top) if it turns out to require persistent connections.
3. **Does the marketplace need payments in this phase?** — the MVP spec explicitly excluded payments/transactions from the Preview. The SOW's "procurement workflows" could mean enquiry-to-quote only (no money changing hands on-platform) or could imply actual checkout — very different scope.

---

## Risks worth naming now

- **Marketplace payments/procurement, if in scope, pull in compliance requirements** (PCI if handling cards directly, or at minimum a payment processor integration) that aren't mentioned in the SOW text — flagging early so it's a decision, not a surprise mid-build.
- **Deferring Hetzner isn't deferring it forever** — if real monitoring integration (open question 2) turns out to need persistent connections, that reopens the architecture question mid-Phase-2. Worth checking in on that specific question early rather than discovering it late.
- **The Atlas smoke-test gap has been open since the MVP build** (Phase B, 2026-07-05) — Stage 1 finally closes it, but it's worth noting this has been a known, accepted gap for over a month, not a new discovery.
