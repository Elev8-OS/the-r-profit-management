/**
 * PLACEHOLDER FX rates — NOT a live feed.
 *
 * Reto chose "daily automatic FX API" as the target approach, but we don't yet have an
 * FX API integrated (no credentials/vendor chosen). Rather than block the whole
 * Opportunity Score feature on that decision, this seed provides one manually-entered
 * rate per currency actually used in the portfolio (IDR, CHF, USD) so cross-currency
 * comparison works today. Every value here is a rough approximation, not a source of
 * financial truth — do NOT use these for accounting/invoicing.
 *
 * TODO (tracked in architecture doc "Build Status"): replace this seed with a real nightly
 * job that pulls from a live FX API (e.g. exchangerate.host, ECB) into the same FxRate
 * table. Once that job exists, this file becomes unnecessary and should be deleted.
 *
 * Reporting currency is CHF (Elev8-OS / "The R" is Swiss-HQ'd). chfPerUnit = how many CHF
 * one unit of `currency` is worth.
 */
export const FX_RATES_SEED = [
  { currency: "CHF", chfPerUnit: 1 },
  { currency: "USD", chfPerUnit: 0.9 },
  { currency: "EUR", chfPerUnit: 0.96 },
  { currency: "IDR", chfPerUnit: 0.000057 },
] as const;

export const FX_RATES_SEED_DATE = "2026-08-07";
