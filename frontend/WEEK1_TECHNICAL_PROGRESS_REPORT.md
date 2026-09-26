# Week 1 Technical Progress Report — Core Backend Foundation

**Period:** 12–16 August 2026 (directive) · **Prepared:** 22 August 2026
**From:** Nathan Mackean, Platform Development Lead
**To:** Jeff Conrad, Technical Lead — for architecture review
**Cc:** Collins Awikpe, Founder & CEO

> Note on timing: this report is being compiled slightly after the Week 1 window closed, but every item below reflects the actual current state of `davwo-mvp1` as of today, verified against the live codebase, test suite, and deployment — not a status recollected from memory.

> **Same-day update:** since first drafting this report, the `staging` branch has been fast-forwarded to match `main` (no longer stale — see Section 4), the signup + Postgres/Prisma work has been merged to `main` and `staging`, and deployed to production (`davwo-mvp1.vercel.app`), verified live. The branch-strategy question for Jeff (Section 5) is still open — fixing the immediate staleness doesn't answer whether `staging` should sit in front of `main` in the review flow going forward.

---

## 1. What currently works

The commercial-journey backbone from the directive's Section 2 already has real, working, tested code behind every step up to the marketplace:

| Journey step | Status | Where |
|---|---|---|
| Customer Registration | 🟢 Working | `POST /api/auth/signup` — org name + email + password → new org + admin user + JWT, one step |
| Organisation Onboarding | 🟢 Working | Dynamic org provisioning (`orgs.ts`), tenant resolution (`tenants.ts`) — every signup gets its own isolated, uniquely-seeded workspace |
| Energy Asset Registration | 🟢 Working | `POST /api/assets`, `GET /api/assets/[id]` — validated create + detail drawer, org-scoped |
| Energy Data / Monitoring | 🟢 Working | `/api/monitoring`, `/api/dashboard/*`, `/api/grid/*` — live UK grid carbon intensity, Octopus Agile tariffs, Open-Meteo weather, all wired through `src/lib/data/*` |
| Analysis & Intelligence | 🟢 Working | `/api/analytics/summary`, `/api/forecasting` — real analytics on top of the above |
| ANI™ Recommendations | 🟡 Partial | `/api/ani/*` (chat, briefing, insights) produce visual, chart-based answers grounded in platform data — but recommendations aren't yet wired to real marketplace listings (see Section 3, "context-specific" gap) |
| Identification of Energy Need | 🟡 Partial | The pilot-onboarding flow (`/demo/start`) generates ROI estimates and flags gaps (e.g. "solar with no battery") from a stated infrastructure profile — not yet from live telemetry |
| Clean-Energy Marketplace | 🟡 Preview only | `/marketplace` — 10 curated vendor listings, browse/filter/contact-form. No supplier self-service, no product catalogue, no persisted enquiry state — this is Week 8's scope, not started |
| Relevant Product / Supplier | 🟡 Partial | Category-matching exists in the pilot flow (recommends a category + a verified vendor) but isn't connected to ANI's live recommendation output |
| Enquiry / Quote / Commercial Action | 🔴 Not started | "Contact Vendor" is a one-shot lead-capture form with no follow-up state machine — no quote, accept/decline, or commercial workflow exists |

**Supporting infrastructure already in place:**
- **Auth & authorisation:** JWT (`jose`), bcrypt-hashed passwords, three roles (admin/operator/pilot), rate limiting on every auth-adjacent endpoint, security headers (CSP/HSTS/X-Frame-Options) via `next.config.ts`.
- **Multi-tenancy:** every request resolves to a tenant-scoped context (`withTenant`/`resolveTenant`) — org data never leaks across tenants, verified by test.
- **Testing foundation:** 154 tests, enforced coverage thresholds (99% statements / 85% branches / 100% functions) gating CI on every push to `main`/`staging`.
- **API surface:** ~44 routes (`/api/*`), typed end-to-end, all under the same Next.js app.

## 2. What has been improved (this reporting window)

Two structural pieces of backend foundation were finished, not just extended:

1. **Self-service signup was fully broken and is now fixed.** Previously: no public signup endpoint existed at all, invited users' temp passwords were generated and then silently discarded (permanently dead accounts), and any unrecognised org id silently defaulted to the `davwo` demo tenant — a real data-isolation bug, not a cosmetic one. Fixed with a real `POST /api/auth/signup`, a dynamic org store, and actual email delivery for invites.
2. **The persistence layer has been rebuilt on Postgres (Supabase) + Prisma, replacing a MongoDB design that had been code-complete since early July but never actually connected to a live database.** This wasn't a data migration (there was no live data to migrate) — it's a full swap of the storage layer underneath every existing store (users, orgs, assets, alerts, marketplace leads, pilot profiles), done specifically because the Postgres/Prisma direction was the confirmed decision for this phase.

Both are merged to `main` and `staging`, and deployed to production. Full detail in `MVP_BUILD_PLAN.md` (Phases G and H).

## 3. What remains

Mapped against the directive's Six Core Development Layers:

- **Layer 1 (Core Platform):** Solid. Auth, multi-tenancy, and the API structure are in good shape. Remaining: a live database (see blockers), and a real git/deploy branch strategy now that Jeff is reviewing architecture (see Section 5).
- **Layer 2 (Energy Monitoring & Data):** Live public data sources are wired (grid carbon, tariffs, weather). What's missing is **real per-customer asset telemetry** — today's dashboard shows either live public data or a synthetic-but-realistic per-org seed, never actual hardware data, because no ingestion path from real assets exists yet. This is Week 4's scope.
- **Layer 3 (ANI™ Intelligence):** The framework exists and is genuinely grounded in platform data (not a generic LLM wrapper) — it monitors, analyses, forecasts, and recommends from real inputs. What's missing, per the directive's own principle ("ANI must not simply operate as a generic AI interface"), is connecting its recommendations to **real marketplace listings** rather than static categories. That depends on Layer 4 existing first.
- **Layer 4 (Marketplace):** Preview-only, as scoped in the original MVP. Supplier onboarding, product catalogue, and any commercial workflow (enquiry → quote → accept) are all Week 8+ scope, not started.
- **Layer 5 (Clean-Energy Integrations):** Not started. This is explicitly gated on one open decision: what "connecting a real asset" technically means for this platform — webhook ingestion, polling a third-party API, or manual/CSV entry (a CSV import path already exists as a fallback). This is flagged as Open Question 2 in `PHASE2_BUILD_PLAN.md` and needs a decision before Layer 5 work can start.
- **Layer 6 (Commercial Customer Experience):** Signup and onboarding work; the rest (customer discovery, validation, usability testing) is CI/CX's remit per the directive, not a backend deliverable.

## 4. Technical blockers

1. **No live database.** The Postgres/Prisma persistence layer is code-complete and fully tested (against a faithful in-memory fake, not a real instance), but `DATABASE_URL`/`DIRECT_URL` are still placeholders everywhere — no Supabase project has been created yet. This is the single largest blocker to anything in the directive that depends on real, durable data (which is most of Layers 2–4). **This is on me/Collins to resolve**, not a dependency on anyone else — a Supabase project needs to exist, and its credentials need to reach `.env.local`, GitHub, and Vercel.
2. ~~`staging` branch is stale~~ **— fixed.** It was 29 commits behind `main` (frozen since before the Next.js rebuild); fast-forwarded to current `main` today. What's still open is whether `staging` is meant to be a real pre-production gate under this directive's governance model, or just a mirror — that's a process decision, not a technical one (see Section 5).
3. **Vercel project is still under a personal account**, not a Davwo Energy Ltd team — flagged since the MVP build, still unresolved. This matters more now than before: multiple developers are about to be onboarded per the directive (Section 8), and they can't get deploy access to a personal account.
4. **No automated deploy pipeline.** Every production deploy so far has been a manual `vercel --prod` from a local machine. This doesn't scale to a multi-developer team and has no audit trail.

## 5. Dependencies on Jeff

- **Architecture sign-off on the two structural changes above** (self-service signup + dynamic tenants; Postgres/Prisma replacing Mongo) — both are done and tested, but per the directive Jeff owns architecture review, so flagging both for explicit review rather than treating them as unilaterally settled.
- **Branch strategy decision.** The directive introduces formal weekly technical governance with Jeff leading review — that implies commits should probably route through a reviewed `staging` branch before `main`, rather than the direct `feat/production-readiness` → `main` → deploy flow used so far. Needs Jeff's call before Week 2's work lands, so it isn't retrofitted after multiple developers are already committing.
- **The "connecting assets" decision** (Open Question 2, `PHASE2_BUILD_PLAN.md`) sits at the intersection of ANI architecture (Jeff) and platform implementation (me) — needs Jeff's input on which ingestion pattern (webhook/polling/manual) fits the ANI recommendation pipeline he's designing for Weeks 6–7, since Layer 5 work should be built toward that, not decided independently and reworked later.

## 6. Dependencies on other developers

- None yet — Developer A and Developer B haven't been onboarded. Once they are, the natural split per the directive's own allocation: Developer A (full-stack) picks up Week 2's customer/organisation UI work in parallel with backend hardening; Developer B (backend/cloud/integration) is the natural owner of Layer 5's data-ingestion architecture once Section 5's "connecting assets" decision is made.
- Amirreza's energy-AI/optimisation work (Weeks 6–7) will depend on the ANI data pipeline being stable by then — no immediate dependency this week, but worth surfacing early since his engagement is still subject to technical assessment.

## 7. Recommended next sprint

Given Week 1's actual required-work list is now substantially complete, I'd propose Week 2 (Customer & Organisation Foundation) start immediately rather than repeating foundation work that's already done, with three additions pulled forward from blockers above because they're cheap to fix now and expensive to fix later:

1. **Provision the Supabase project and land real credentials** — this unblocks everything downstream and is pure infrastructure setup, not development time.
2. **Resolve the branch-strategy question with Jeff** (staging is no longer stale, but whether it's a review gate in front of `main` is still undecided) before a second developer starts committing.
3. **Move the Vercel project to a Davwo Energy Ltd team** before onboarding Developer A/B, so deploy access is grantable rather than blocked on one person's account.
4. Then proceed into Week 2's actual scope: organisation account settings, user-role UI, customer dashboard foundation — building on the auth/org/tenant layer that's already solid.
