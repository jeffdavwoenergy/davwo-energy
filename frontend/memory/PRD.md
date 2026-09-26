# DAVWO / ANI™ — Product Requirements Document

## Problem Statement
Build the **DAVWO Demo Module** — a hyper-intelligent energy forecasting tool showcasing how **ANI™** (Augmented Network Intelligence) transforms infrastructure data into actionable intelligence for EV charging, battery storage, solar, and grid assets.

The MVP must answer one question: *How does ANI™ help infrastructure operators make better decisions, reduce costs, improve efficiency, and optimise operations?*

It is **not** a marketing site, EV marketplace, product catalogue, or e-commerce platform.

## User Personas
- **Investors / Grant Assessors** — need to validate the ANI™ value proposition
- **Pilot Customers** — energy & infrastructure operators evaluating the platform
- **Suppliers / Universities / Strategic Partners** — exploring integration opportunities
- **Internal Admins / Operators** — daily-use dashboards once deployed

## Core Requirements (static)
- Monitor, Analyse, Predict, Recommend, Optimise infrastructure operations
- Real-time UK EV-charging context (cost in £, energy in MWh/kWh, carbon in tCO₂)
- ANI™ chat must be quantified & actionable, never invent off-domain data
- Brand: green/blue/orange leaf logo, "DAVWO" wordmark in green
- Three demo roles: Admin / Operator / Pilot
- Tech stack: React + Tailwind + Shadcn + Recharts (frontend), FastAPI + MongoDB + emergentintegrations (backend)
- LLM: Claude Sonnet 4.5 via Emergent Universal Key

## v1 — Implemented (2026-06-12)
**Backend (FastAPI + MongoDB):**
- JWT auth (bcrypt + PyJWT), 3 seeded demo users
- `/api/auth/login`, `/api/auth/me`, `/api/auth/demo-login`
- Live data simulator for KPIs, energy series, forecast, infrastructure map, alerts, scenarios, case studies
- `/api/dashboard/metrics`, `/api/dashboard/energy-series`, `/api/dashboard/recommendation`, `/api/dashboard/map`
- `/api/assets`, `/api/assets/summary` (with filters)
- `/api/alerts`, `/api/alerts/{id}/acknowledge`, `/api/alerts/{id}/resolve`
- `/api/analytics/overview`, `/api/analytics/top-assets`
- `/api/forecasting?horizon=24h`
- `/api/reports/overview`
- `/api/ani/chat` (Claude Sonnet 4.5), `/api/ani/chat/stream`, `/api/ani/chat/{session}/messages`, `/api/ani/insights`, `/api/ani/quick-summary`
- `/api/demo/scenarios`, `/api/demo/case-studies`, `/api/demo/tour`
- MongoDB collections: users, assets, alerts, scenarios, case_studies, chat_messages

**Frontend (React + Tailwind):**
- Landing page (dark hero, ANI orb, capabilities, scenarios preview, CTA)
- Login (split layout, role quick-login)
- Dashboard layout (sidebar, top bar, footer)
- 10 platform pages: Dashboard, Monitoring, Analytics, Forecasting, Alerts, Assets, Reports, AI Assistant, Settings, Demo Module
- 6 Demo Module pages: Home, Try ANI™, Scenario Explorer (list + detail), Guided Tour, Case Studies, Completion
- ANI™ Floating chat panel (dark, animated, streaming-ready)
- Real-time polling every 5–10s for live KPI feel
- All interactive elements have `data-testid` attributes

## Demo Credentials
- Admin → `admin@davwo.com / Demo@123`
- Operator → `operator@davwo.com / Demo@123`
- Pilot → `pilot@davwo.com / Demo@123`

## P0 Backlog (post-v1)
- Server-Sent-Events streaming wired to UI for true token-by-token ANI™ output
- Persistent chat sessions per user
- Embedded data visualisations inside ANI™ replies (chart cards rendered from JSON)
- Per-role permissions (Operator hides Settings/Admin, Pilot hides Assets management)

## P1 Backlog
- Asset detail drawer
- Reports → actual PDF export
- Light/dark mode toggle for dashboard
- Push notifications (email + in-app)
- Acknowledged/resolved alerts persisted history view

## P2 Backlog
- Cross-sector (water, heat, gas) scenario packs
- Real data connectors (CSV upload, OCPP, Modbus, Open APIs)
- Multi-tenant org switching
- ANI™ recommendation auto-execute workflows
