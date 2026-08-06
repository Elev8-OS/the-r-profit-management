# The R — Revenue & Profit Management

A profit-first revenue management tool for The R's short-term rental portfolio
(Bali + Switzerland). Combines revenue/pricing data from PriceLabs and
MyDataValue with operating costs and Elev8 Suite operational data to compute
RevPAR *and* Profit PAR, and lets you push approved pricing/discount/nudge
actions back out to PriceLabs and MyDataValue with one click.

See `docs/architecture.md` for the full architecture and phased build plan
(also saved in the "Profit Management Dashboard" Claude project).

## Monorepo layout

- `apps/web` — Next.js dashboard (App Router), Microsoft Entra ID SSO via NextAuth. Live pages: `/listings` (add listings, enter fixed monthly costs + capex per listing), `/settings/rate-cards` (tenant-wide cleaning rate / management fee % / capex amortization period, with per-listing overrides).
- `apps/worker` — BullMQ background worker: scheduled syncs, ID reconciliation, nightly KPI computation, recommendation engine
- `packages/db` — Prisma schema + client (Postgres, multi-tenant from day 1)
- `packages/shared` — KPI formulas (RevPAR / Operating & Fully-Loaded Profit PAR), shared types
- `packages/integrations` — typed clients for PriceLabs, MyDataValue, Elev8 Suite (currently stubs — see Phase 1 blockers below)

## Status: Phase 1 in progress

- [x] Monorepo scaffold, Prisma schema v1, NextAuth Entra ID config wired (needs real Azure app registration — see `docs/entra-sso-setup.md`)
- [x] Railway project provisioned: `the-r-profit-management` (postgres, redis; `web-app`/`worker-app` connected to this GitHub repo and deploying on every push — live at `https://web-app-production-d5b8.up.railway.app`). Orphaned placeholder services `web`/`worker` (created before the repo existed) can be deleted from the Railway dashboard.
- [x] DB schema applied via `prisma db push` + seed automatically on every `web-app` deploy (`preDeployCommand`) — no manual migration step needed at this stage. Seeds the single "The R" tenant + admin user (reto.wyss@elev8-suite.com); switch to real `prisma migrate` history once the schema stabilizes.
- [x] Cost entry UI is real and functional: `/listings` (add a listing, or click into one to add fixed monthly costs / capex), `/settings/rate-cards` (cleaning rate, management fee %, capex amortization period — tenant default + optional per-listing override). All values start at 0 — nothing is hardcoded, everything is entered through the web interface.
- [ ] Real PriceLabs/MyDataValue/Elev8 API clients (Phase 1) — MDV confirmed scoped to account_name "Reto Wyss"; Elev8 has a service key (`ELEV8_API_KEY`, set on `worker-app`) but its base URL/auth scheme are still unconfirmed (see `packages/integrations/src/elev8/client.ts`)
- [ ] Cross-system listing ID reconciliation (Phase 1) — for now, listings are added by hand via `/listings`
- [ ] Nightly KPI job (Phase 1) — needs real revenue sync first
- [ ] Recommendation engine (Phase 2)
- [ ] One-click push to PriceLabs/MyDataValue (Phase 3)
- [ ] Multi-tenant onboarding of other Elev8 Suite customers (Phase 4)

## Known Phase 1 blockers (see docs/architecture.md "Open Items")

1. ~~Which MyDataValue `account_name`(s) belong to this tenant~~ — confirmed: "Reto Wyss" only (see `.env.example` / `packages/integrations/src/mdv/client.ts`).
2. ~~Cost-allocation methodology~~ — resolved by putting real values in the hands of the user: enter them at `/settings/rate-cards` and per-listing at `/listings/[id]`, no engineering defaults baked in.
3. Elev8 Suite API: a service key exists (`ELEV8_API_KEY`) but the base URL and auth header format (Bearer vs custom header; REST vs the MCP SSE endpoint) are still unconfirmed — needed before `apps/worker/src/jobs/syncElev8.ts` can be implemented for real.
4. Elev8 Suite API/tenant-scoping behavior needs confirming before Phase 4 (multi-tenant data isolation).

## Local development (once dependencies are installed)

```bash
pnpm install
cp .env.example .env   # then fill in real values
pnpm --filter @the-r/db exec prisma db push
pnpm --filter @the-r/db run seed
pnpm dev
```
