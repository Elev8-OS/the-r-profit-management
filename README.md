# The R — Revenue & Profit Management

A profit-first revenue management tool for The R's short-term rental portfolio
(Bali + Switzerland). Combines revenue/pricing data from PriceLabs and
MyDataValue with operating costs and Elev8 Suite operational data to compute
RevPAR *and* Profit PAR, and lets you push approved pricing/discount/nudge
actions back out to PriceLabs and MyDataValue with one click.

See `docs/architecture.md` for the full architecture and phased build plan
(also saved in the "Profit Management Dashboard" Claude project).

## Monorepo layout

- `apps/web` — Next.js dashboard (App Router), Microsoft Entra ID SSO via NextAuth
- `apps/worker` — BullMQ background worker: scheduled syncs, ID reconciliation, nightly KPI computation, recommendation engine
- `packages/db` — Prisma schema + client (Postgres, multi-tenant from day 1)
- `packages/shared` — KPI formulas (RevPAR / Operating & Fully-Loaded Profit PAR), shared types
- `packages/integrations` — typed clients for PriceLabs, MyDataValue, Elev8 Suite (currently stubs — see Phase 1 blockers below)

## Status: Phase 0 (foundations) — scaffold only

Nothing here talks to real data yet. Current state:
- [x] Monorepo scaffold, Prisma schema v1, NextAuth Entra ID config wired (needs real Azure app registration — see `docs/entra-sso-setup.md`)
- [x] Railway project provisioned: `the-r-profit-management` (postgres, redis, web, worker services; web domain: `web-production-861bb.up.railway.app`). `web`/`worker` have no deploy source yet — connect them to this repo once it exists on GitHub.
- [ ] Real PriceLabs/MyDataValue/Elev8 API clients (Phase 1)
- [ ] Cross-system listing ID reconciliation (Phase 1)
- [ ] Cost entry UI + nightly KPI job (Phase 1)
- [ ] Recommendation engine (Phase 2)
- [ ] One-click push to PriceLabs/MyDataValue (Phase 3)
- [ ] Multi-tenant onboarding of other Elev8 Suite customers (Phase 4)

## Known Phase 1 blockers (see docs/architecture.md "Open Items")

1. Which MyDataValue `account_name`(s) belong to this tenant — confirmed data shows 6 distinct account names on the connected MDV account; only some are "The R".
2. Cost-allocation methodology (capex amortization period, cleaning rate card values, management-fee %) needs a business decision before `computeProfitPar` numbers can be trusted.
3. No confirmed general public API for Elev8 Suite yet — needed for the worker's sync job (`apps/worker/src/jobs/syncElev8.ts` is currently a stub that throws).
4. Elev8 Suite API/tenant-scoping behavior needs confirming before Phase 4 (multi-tenant data isolation).

## Local development (once dependencies are installed)

```bash
pnpm install
cp .env.example .env   # then fill in real values
pnpm --filter @the-r/db exec prisma migrate dev
pnpm dev
```
