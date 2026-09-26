# DAVWO / ANI™

**Augmented Network Intelligence for energy infrastructure** — monitor, analyse,
predict, recommend and optimise EV-charging, battery, solar and grid assets for the
UK market.

> Rebuilt as a single **Next.js (App Router) + TypeScript** app on **Vercel**,
> wired to real public UK energy data. Migration plan & status in
> [`PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md).

## Stack

```
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v3 · shadcn/ui · Recharts
  src/app/(app)/*        dashboard tabs (auth-gated shell)
  src/app/api/*          backend route handlers (replace the old FastAPI server)
  src/lib/server/*       data providers, auth (jose JWT)
  src/lib/data/*         real public-API connectors (Phase 2)
  src/lib/ani/*          ANI engine — monitor/analyse/forecast/recommend (Phase 2)
```

The frontend talks to its own `/api/*` route handlers (same origin). The data
source is swappable behind `USE_REAL_DATA` while keeping the response contract
stable.

### Real data sources (Phase 2)
| Source | Used for | Key |
| --- | --- | --- |
| [Carbon Intensity](https://carbonintensity.org.uk/) | gCO₂/kWh + generation mix | none |
| [Octopus Agile](https://developer.octopus.energy/) | live £/kWh tariff | none |
| [Open-Meteo](https://open-meteo.com/) | weather/solar → forecast drivers | none |
| [OpenChargeMap](https://openchargemap.org/) | real EV charge-point map | free key |

## Local development

```bash
npm install
cp .env.example .env.local      # set JWT_SECRET (+ later: OCM_API_KEY, OPENAI_API_KEY)
npm run dev                     # http://localhost:3000
```

Demo logins (Phase 1, in-memory): `admin@davwo.com` / `operator@davwo.com` /
`pilot@davwo.com` — password `Demo@123`. Replaced by MongoDB + bcrypt in Phase 2.

## Deploy

- **Vercel** (single project). Production = `main`; Preview/Staging = PR branches & `staging`.
  Set env vars in Project → Settings. Framework auto-detected (Next.js), root = repo root.
- **CI** runs type-check + build on every PR ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)).

## Scripts
| command | does |
| --- | --- |
| `npm run dev` | local dev server |
| `npm run build` | production build (type-checks) |
| `npm run lint` | ESLint |
