# The R — Revenue & Profit Management App

## Context

Reto (Founder & CTO, Elev8-Suite) wants a revenue-management tool for his own short-term-rental portfolio ("The R" brand: ~24 Bali villas + ~27 Swiss apartments, confirmed live across PriceLabs, MyDataValue and Elev8 Suite) that goes beyond standard RevPAR optimization to optimize **Profit PAR** — factoring in real operating costs, not just rate/occupancy. It must let him enter costs, see profit-aware KPIs, get concrete pricing/restriction/discount recommendations with a clear rationale, and push approved actions to PriceLabs / MyDataValue with one click — never fully automated. Phase 1 is for Elev8-OS only, but the architecture must support onboarding other Elev8 Suite property-management customers as isolated tenants later, with Microsoft Entra ID (elev8-suite.com) SSO login.

This is a greenfield build — no existing codebase. Confirmed via live tool calls today: PriceLabs (52 listings, `pms_name: channex`), MyDataValue (94 records across 58 Booking.com + 36 Airbnb, spanning 6 `account_name`s — needs scoping decision), Elev8 Suite (72 flat listing records, no cost data, inconsistent country/currency tagging). Existing infra: Railway workspace "elev8-os's Projects" (19 projects already, e.g. `mydatavalue-mcp`, `Accounting-system`) and GitHub org `Elev8-OS`.

An architecture deep-dive (via a Plan subagent, informed by all the above) produced the design below; a copy is also saved to the project as `architecture/profit-management-app-architecture-v1.md`.

## Architecture

- **Frontend:** Next.js 14 (App Router) + TypeScript, Tailwind + shadcn/ui, TanStack Query/Table, Recharts.
- **Backend:** Next.js route handlers (tRPC) for CRUD; separate **worker service** (BullMQ + Redis) in the same monorepo for scheduled syncs and the recommendation engine.
- **Database:** Postgres (Railway plugin) + Prisma. Multi-tenant from day 1 via `tenant_id` on every scoped table; Postgres RLS added as defense-in-depth before tenant #2 is onboarded (additive, not a rewrite).
- **Auth:** NextAuth.js with Microsoft Entra ID (Azure AD) OIDC provider. Phase 1: single-tenant app registration scoped to elev8-suite.com, JIT-provision users on first login. Later: convert to multi-tenant OIDC, map Entra `tid` → internal `tenant_id`.
- **Integration approach:** production sync workers call the vendors' **REST APIs directly**, not the agent-facing MCP tools (MCP is fine for this planning session, but is the wrong access pattern for a cron worker polling ~90 listings repeatedly). Elev8 Suite has **no confirmed general public API** today (only PMS integration guides for Beds24/Guesty) — this needs a direct ask to Elev8 Suite engineering for a service credential or read replica; treat as a hard Phase-1 dependency, flagged below.
- **Hosting:** new Railway project `the-r-profit-management` in the existing "elev8-os's Projects" workspace; services `web`, `worker`, `postgres`, `redis`; separate `staging`/`production` environments (important once Phase 3 can push real pricing changes). New repo under GitHub org `Elev8-OS`.
- **Monorepo layout:** `apps/web`, `apps/worker`, `packages/db` (Prisma), `packages/integrations` (typed PriceLabs/MDV/Elev8 clients), `packages/shared` (KPI formulas, types).

## Data Model (core tables)

- `tenant`, `user` (tenant_id, entra_object_id, entra_tenant_id, role)
- `internal_listing` — our own stable PK; the hub every other table hangs off
- `listing_external_ref` (internal_listing_id, system: pricelabs|mdv_airbnb|mdv_booking|elev8, external_id, external_meta jsonb, match_confidence) — solves the "no shared IDs across the 3 systems" problem; unique on (system, external_id)
- `reservation`, `daily_metric` (listing-day grain: revenue, adr, occupancy) — synced facts
- Costs: `cost_fixed_monthly` (rent/utilities/insurance/software, date-ranged), `cost_rate_card` (cleaning_hourly/flat, management_fee_pct), `cost_cleaning` (auto-derived from Elev8 cleaning-duration data × rate card), `cost_capex` (one-off repairs/damage/furniture)
- `kpi_daily_snapshot` (revenue, cost breakdown, profit, revpar, operating_profit_par, fully_loaded_profit_par, `formula_version`)
- `recommendation` (type, date_range, trigger_signal jsonb, proposed_action jsonb, rationale_text, status, target_system, external_action_ref, decided_by/at) + `recommendation_audit_log` (full trail: created/viewed/approved/rejected/sent/send_failed)
- `sync_run` (per external system, per job execution: status, counts, errors)

**Profit PAR formulas (need Reto/finance sign-off before shipping, then version-locked via `formula_version`):**
- RevPAR = Revenue ÷ Available Room-Nights (standard)
- **Operating Profit PAR** = (Revenue − prorated Fixed Costs − Cleaning Costs − Management Fee) ÷ Available Room-Nights — the primary metric for pricing decisions
- **Fully-Loaded Profit PAR** = Operating Profit PAR − (Capex amortized over trailing 12mo) ÷ Available Room-Nights — secondary owner-level P&L view

## Recommendation Engine (nightly, rule-based TypeScript, never live-evaluated)

Every recommendation always requires an explicit human click before anything is pushed externally.

1. High occupancy (>85% trailing 30d) + margin below floor + ADR under market → recommend price increase
2. High cleaning-cost-per-night + short avg LOS → recommend min-stay increase or MDV weekly/LOS discount (fewer turnovers)
3. Gap-fill in next 14 days → recommend price cut, but **never below `minimum_viable_price`** (cleaning + commission + allocated mgmt fee per stay ÷ avg LOS + buffer) — if PriceLabs/MDV suggest lower, cap and surface the conflict explicitly (core "profit not revenue" guardrail)
4. PriceLabs nudge accept/reject: only suggest "accept" if projected profit impact (price × occupancy delta − incremental cost) is positive and above a minimum threshold
5. Any price-increase recommendation nets out marginal management fee — must be net-profit-positive, not just revenue-positive
6. MDV discount: enable/adjust last-minute discount only if it keeps price ≥ `minimum_viable_price`; recommend disabling unneeded early-bird/LOS discounts when demand is already high
7. Cross-system conflict flag: if a listing is dual-managed by PriceLabs + MDV, prompt Reto to designate one source of truth before further pushes

## Phased Delivery Plan

- **Phase 0 — Foundations (1-2 wks):** monorepo scaffold, Railway project (web/worker/postgres/redis, staging+prod), Entra ID app registration + NextAuth end-to-end, Prisma schema v1, CI in `Elev8-OS` GitHub org. *Milestone: empty dashboard behind MS SSO, deployed.*
- **Phase 1 — Read-only dashboard + cost entry + RevPAR/Profit PAR (4-6 wks):** assisted ID reconciliation across all ~70-90 listings (populates `listing_external_ref`, normalizes country/currency); read-only sync workers (PriceLabs, MDV filtered to the correct `account_name`(s), Elev8); cost-entry UI; nightly KPI job. *Milestone: log in via MS SSO, see RevPAR + Profit PAR for every listing, add a cost entry, watch Profit PAR update.*
- **Phase 2 — Recommendation engine, read-only (4-5 wks):** rule set from above against synced data; recommendations inbox (rationale, approve/reject, no external push yet); audit log wiring. *Milestone: system proposes cost-aware recommendations with zero real-world side effects.*
- **Phase 3 — One-click push to PriceLabs/MDV (3-4 wks):** outbound clients (date overrides, nudge accept, MDV promotion updates); "Send" button with diff-confirmation + dry-run/staging mode + rate-limit-aware queuing. *Milestone: clicking "Send" actually changes a price/nudge/discount, verifiable on next sync.*
- **Phase 4 — Multi-tenant onboarding of other Elev8 Suite customers (3+ wks/tenant):** tenant provisioning, per-tenant vendor credentials, multi-tenant Entra OIDC, RLS hardening. *Milestone: a second company onboarded with isolated data, config-only.*

## Open Items to Resolve Early in Phase 1 (not blockers to starting, but must be nailed down before KPIs are trusted)

1. Which MyDataValue `account_name`(s) actually belong to "The R" tenant (Reto Wyss confirmed; Henrik Sugiyo / Rachel Wyss / Mile Ignjatic / revtech17 / myDataValueBot — need explicit confirmation, don't assume).
2. Cost-allocation methodology: capex amortization period, cleaning rate card values, management-fee %.
3. Get a real integration path into Elev8 Suite data (service API key or read replica) since no general public API currently exists — needed before Phase 1's Elev8 sync worker can be built for real (MCP tools remain fine for this planning/prototyping stage).
4. Confirm Elev8 Suite MCP/API tenant scoping behavior before Phase 4 (multi-tenant data isolation).

## Immediate Next Steps (what I'll do once this plan is approved)

1. Create the GitHub repo under `Elev8-OS` and scaffold the Turborepo monorepo (Phase 0).
2. Provision the new Railway project (`the-r-profit-management`) with web/worker/postgres/redis across staging + production environments.
3. Set up the Entra ID app registration for MS SSO and wire NextAuth end-to-end.
4. Build the Prisma schema v1 and the `listing_external_ref` reconciliation job, starting with a dry-run against the live PriceLabs/MDV/Elev8 data already pulled today.
5. Check in with you specifically on the 4 open items above before the KPI formulas go live.

## Verification

- Phase 0: successful MS-SSO login on the deployed Railway URL, empty dashboard renders, CI green.
- Phase 1: reconciliation job report showing match/unmatched counts per listing across all 3 systems; KPI snapshot spot-checked by hand for 2-3 known listings against manually computed RevPAR/Profit PAR; cost entry CRUD covered by integration tests.
- Phase 2: recommendation rules covered by unit tests with synthetic fixture data for each rule (1-7 above); manual review of a full night's recommendation batch against real data for plausibility.
- Phase 3: staging-environment dry run of each push type (price override, nudge accept, min-stay, MDV discount) verified against sandbox/test listings (or off-peak real listings with tiny, reversible changes) before enabling in production.
