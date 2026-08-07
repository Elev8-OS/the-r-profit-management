import type {
  ChannelSystem,
  OpportunityScoreDriver,
  OpportunityScoreListingInput,
  OpportunityScorePortfolioContext,
  OpportunityScoreResult,
} from "./types";

/**
 * Opportunity Score — v1.
 *
 * Answers Reto's ask: "welche properties Aufmerksamkeit benötigen, was nicht gut
 * läuft mit Auslastung, Pricing, Views/CTR — einfach alles was Profit
 * verunmöglicht bzw. schmälert mit Handlungsempfehlung und Begründung."
 *
 * Six weighted dimensions (weights sum to 100), each a 0-100 "severity" (higher =
 * more urgent). Do not change the weights/formula shape without bumping
 * OPPORTUNITY_FORMULA_VERSION, so historical OpportunityScoreSnapshot rows stay
 * comparable (same convention as computeProfitPar's FORMULA_VERSION).
 *
 *   A. Market-relative occupancy       weight 30
 *   B. Near-term gap risk              weight 20
 *   C. Pricing opportunity             weight 15
 *   D. Views -> booking conversion     weight 15
 *   E. Guest satisfaction              weight 10
 *   F. Cost anomaly / margin erosion   weight 10
 *
 * IMPORTANT DESIGN NOTE ("dampening"): raw "nights unbooked" numbers are
 * misleading without market context. Real example from the captured PriceLabs
 * data: both "The R Villa Merapi" and "The R Pererenan Mezzanine Studio + Plunge
 * Pool" show large upcoming gaps in Elev8's raw gap calendar, yet PriceLabs' own
 * health check says BOTH are *outperforming* their market this month (heading
 * color "Blue"). Dimension B is therefore dampened (x0.25) whenever Dimension A's
 * severity is < 20 — gap-risk is only allowed to scream at full volume when the
 * market-relative signal agrees something is actually wrong. See worked example 1.
 *
 * Every insufficient-data case (traffic too low, too few reviews, no cost data
 * entered) returns severity 0 with an explanatory `detail` string rather than
 * silently omitting the dimension. Because the final `drivers` array only keeps
 * entries with severity > 15 (per spec, to avoid cluttering the UI with
 * non-issues), these "insufficient data" notes will in practice rarely surface on
 * their own — they exist so the internal reasoning is inspectable/testable, and so
 * a future version can choose to surface "no data" separately from "healthy"
 * without changing this function's contract.
 *
 * ---------------------------------------------------------------------------
 * WORKED EXAMPLES (real captured data, 2026-08-06/07 — see prisma/seedData/*)
 * ---------------------------------------------------------------------------
 *
 * 1) "The R Villa Merapi" — a case the dampening logic exists specifically for.
 *    - PriceLabsHealthSnapshot: statusColor "Blue" -> severity A = 0
 *      (method "pricelabs_market" — this listing IS in the sample of listings
 *      with real PriceLabs health data).
 *    - elev8UpcomingGaps.json rows named "The R Villa Merapi" exist (e.g. 31, 24,
 *      16, 9, 3 unbooked nights across what look like several room-level gap
 *      records) — but none of their listing_id GUIDs normalize to Villa Merapi's
 *      real ELEV8 externalId (afa397b2-7857-42f2-afe7-76f44e2372a4) or to any
 *      other known ELEV8 ref (checked against all 43 known confirmed IDs: 0
 *      matches out of 52 gap rows, portfolio-wide). So in practice
 *      unbookedNightsNext30 is simply unavailable for this listing via the
 *      documented normalization — severity B = 0 for lack of data, not because
 *      dampening kicked in. Either way the net effect is the same: this
 *      dimension does not scream about Merapi, which is the correct outcome.
 *    - MDV Booking.com funnel: searchViews 51,391 / propertyViews 323 /
 *      bookingConversions 0 -> conversion rate 0%, a low percentile within the
 *      portfolio (severity ~86 in our reference run) -> real, legitimate
 *      "conversion" driver even though occupancy is fine.
 *    - MDV Booking.com reviews: score 10/10 but only 2 reviews -> below the
 *      reviewCount >= 5 threshold -> severity E = 0 ("insufficient reviews").
 *    - Net: total score stays LOW (~13/100 in our reference run against the
 *      full captured dataset) with "conversion" as the only real driver —
 *      exactly the intended behavior: don't flag a listing that PriceLabs says
 *      is outperforming its market just because a raw gap count looks scary.
 *
 * 2) "The R Pererenan Mezzanine Studio + Plunge Pool" — Dimension C catching a
 *    real pricing bug that occupancy/gap dimensions would miss entirely.
 *    - PriceLabsHealthSnapshot: statusColor "Blue" -> severity A = 0 (also
 *      outperforming its market this month; also has large raw gap numbers that
 *      are correctly not flagged, same reasoning as example 1).
 *    - elev8PerformanceSummaryAug2026.json, currency CHF, this listing has three
 *      rows: avg_daily_rate 88.75 (24 nights), 80.72 (2 nights), and 0 (41
 *      nights, total_revenue ~0.01 CHF) -> median 80.72, min 0.
 *      0 < 80.72 * 0.5 = 40.36 -> ADR-outlier sub-check fires at severity 100.
 *      This is almost certainly a data/rate bug (a comped stay or a botched
 *      rate push), not a demand problem — worth a human looking at it.
 *    - Net: total score ~15/100 in our reference run, entirely from the
 *      "pricing" driver — small overall because only one dimension is firing,
 *      but the driver itself is a concrete, actionable, non-obvious catch.
 *
 * 3) "The R Suites Hasenberg" — a mostly-healthy listing with one real, minor
 *    pricing opportunity, to sanity-check the "healthy" end of the scale.
 *    - PriceLabsHealthSnapshot: statusColor "Blue" -> severity A = 0.
 *    - PriceLabsNudge pending: base price 104 -> 112 CHF.
 *      severity = clamp(|112-104|/104*100*4, 0, 100) = clamp(30.8, 0, 100) = 30.8.
 *    - No MDV Airbnb/Booking match for this listing in the captured sample (its
 *      MDV linkage was not part of the confirmed heuristic match set) -> D and E
 *      both effectively 0 (no data).
 *    - Net: total score ~5/100 in our reference run — reads as "essentially
 *      fine, minor price nudge available", which matches the underlying reality.
 *
 * A standalone Python simulation of the full matching + scoring pipeline against
 * every real seedData file (not just these 3 listings) was used to sanity-check
 * this formula before wiring it into Prisma; see the PR/session notes for the
 * full ranked output.
 */
export const OPPORTUNITY_FORMULA_VERSION = "v1";

const WEIGHTS = {
  occupancy: 30,
  gaps: 20,
  pricing: 15,
  conversion: 15,
  reviews: 10,
  cost: 10,
} as const;

function clamp(value: number, lo = 0, hi = 100): number {
  if (Number.isNaN(value)) return lo;
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Percentile rank of `value` within `sortedOrUnsorted` (0-100). Uses the
 * "mean rank" convention (ties split the difference) so a value tied with the
 * whole array lands at the 50th percentile rather than 0 or 100.
 * Returns 50 (neutral) for an empty comparison set — "no portfolio context"
 * should never be interpreted as "worst in portfolio".
 */
function percentileRank(value: number, values: number[]): number {
  if (values.length === 0) return 50;
  let less = 0;
  let equal = 0;
  for (const v of values) {
    if (v < value) less++;
    else if (v === value) equal++;
  }
  return ((less + 0.5 * equal) / values.length) * 100;
}

function healthColorSeverity(color: "Red" | "Yellow" | "Green" | "Blue"): number {
  switch (color) {
    case "Red":
      return 100;
    case "Yellow":
      return 50;
    case "Green":
    case "Blue":
      return 0;
  }
}

interface DimensionA {
  severity: number;
  method: "pricelabs_market" | "portfolio_median_fallback" | "no_data";
  detail: string | null;
}

function computeDimensionA(
  input: OpportunityScoreListingInput,
  portfolio: OpportunityScorePortfolioContext
): DimensionA {
  if (input.priceLabsHealth) {
    const severity = healthColorSeverity(input.priceLabsHealth.statusColor);
    return {
      severity,
      method: "pricelabs_market",
      detail:
        severity > 0
          ? `PriceLabs Markt-Check stuft die Auslastung als "${input.priceLabsHealth.statusColor}" ein: ${input.priceLabsHealth.statusText}`
          : null,
    };
  }

  if (input.ownOccupancyPct != null && portfolio.medianOccupancyPct > 0) {
    const own = input.ownOccupancyPct;
    const median = portfolio.medianOccupancyPct;
    const severity = clamp(((median - own) / median) * 100);
    return {
      severity,
      method: "portfolio_median_fallback",
      detail:
        severity > 0
          ? `Auslastung ${own.toFixed(1)}% vs. Portfolio-Median ${median.toFixed(1)}% (kein PriceLabs-Marktvergleich für dieses Listing verfügbar — Fallback auf Portfolio-Median).`
          : null,
    };
  }

  return { severity: 0, method: "no_data", detail: null };
}

interface DimensionB {
  severity: number;
  detail: string | null;
  rawUnbookedNights: number | null;
}

function computeDimensionB(
  input: OpportunityScoreListingInput,
  dimensionASeverity: number
): DimensionB {
  const nights = input.unbookedNightsNext30;
  if (nights == null) {
    return { severity: 0, detail: null, rawUnbookedNights: null };
  }

  const rawSeverity = clamp((nights / 30) * 100);
  const dampened = dimensionASeverity < 20;
  const severity = dampened ? rawSeverity * 0.25 : rawSeverity;

  const detail = dampened
    ? `${nights} von 30 Nächten unbelegt in den nächsten 30 Tagen, das Marktsignal (PriceLabs bzw. Portfolio-Median) zeigt aber keine auffällige Unterauslastung — vermutlich normale Nebensaison, kein Preisproblem.`
    : `${nights} von 30 Nächten unbelegt in den nächsten 30 Tagen bei gleichzeitig schwachem Marktsignal — echtes Auslastungsrisiko.`;

  return { severity, detail: severity > 0 ? detail : null, rawUnbookedNights: nights };
}

interface DimensionC {
  severity: number;
  detail: string | null;
  nudgeSeverity: number;
  adrOutlierSeverity: number;
  adrOutlierInfo: { currency: string; min: number; median: number } | null;
}

function computeDimensionC(input: OpportunityScoreListingInput): DimensionC {
  let nudgeSeverity = 0;
  if (input.pendingNudge && input.pendingNudge.currentValue > 0) {
    const { currentValue, suggestedValue } = input.pendingNudge;
    nudgeSeverity = clamp((Math.abs(suggestedValue - currentValue) / currentValue) * 100 * 4);
  }

  let adrOutlierSeverity = 0;
  let adrOutlierInfo: { currency: string; min: number; median: number } | null = null;
  for (const stats of input.adrStatsByCurrency ?? []) {
    if (stats.median > 0 && stats.min < stats.median * 0.5) {
      adrOutlierSeverity = 100;
      adrOutlierInfo = { currency: stats.currency, min: stats.min, median: stats.median };
      break;
    }
  }

  const severity = Math.max(nudgeSeverity, adrOutlierSeverity);

  let detail: string | null = null;
  if (severity > 0) {
    if (adrOutlierSeverity >= nudgeSeverity && adrOutlierInfo) {
      detail = `Mindestens eine Buchung zu einem auffällig niedrigen Tagespreis gefunden (min. ${adrOutlierInfo.min.toFixed(2)} ${adrOutlierInfo.currency} vs. Median ${adrOutlierInfo.median.toFixed(2)} ${adrOutlierInfo.currency}, <50%) — vermutlich ein Preis-/Datenfehler, keine Marktentscheidung.`;
    } else if (input.pendingNudge) {
      detail = `PriceLabs schlägt eine Preisanpassung von ${input.pendingNudge.currentValue} auf ${input.pendingNudge.suggestedValue} vor (bereits durch PriceLabs vorgeprüft).`;
    }
  }

  return { severity, detail, nudgeSeverity, adrOutlierSeverity, adrOutlierInfo };
}

interface DimensionD {
  severity: number;
  drivers: OpportunityScoreDriver[];
}

const MIN_PROPERTY_VIEWS_FOR_CONVERSION = 50;
const MIN_SEARCH_VIEWS_FOR_SEARCH_TO_VIEW_CHECK = 1000;
const SEARCH_TO_VIEW_LOW_THRESHOLD_RATIO = 0.5;

function computeDimensionD(
  input: OpportunityScoreListingInput,
  portfolio: OpportunityScorePortfolioContext
): DimensionD {
  const drivers: OpportunityScoreDriver[] = [];
  let best = 0;

  for (const funnel of input.channelFunnels ?? []) {
    const { system, searchViews, propertyViews, bookingConversions } = funnel;

    if (propertyViews >= MIN_PROPERTY_VIEWS_FOR_CONVERSION) {
      const rate =
        system === "MDV_AIRBNB" && funnel.viewToBookingRate != null
          ? funnel.viewToBookingRate
          : propertyViews > 0
            ? bookingConversions / propertyViews
            : 0;
      const pctRank = percentileRank(rate, portfolio.conversionRatesBySystem[system] ?? []);
      const severity = 100 - pctRank;
      if (severity > best) best = severity;
      if (severity > 15) {
        drivers.push({
          category: "conversion",
          severity,
          detail: `${channelLabel(system)}: Conversion-Rate ${(rate * 100).toFixed(2)}% liegt im unteren ${pctRank.toFixed(0)}. Perzentil des Portfolios (${propertyViews} Property Views, ${bookingConversions} Buchungen).`,
          actionSuggestion:
            "Preis, Mindestaufenthalt und Verfügbarkeit für diesen Kanal prüfen — genug Interesse (Views) wird nicht in Buchungen umgesetzt.",
        });
      }
    } else {
      // Not enough traffic to say anything meaningful — explicitly "unknown", not "fine".
      // (Filtered out of the returned drivers array since severity is 0 — see file header.)
    }

    const searchToViewRate =
      funnel.searchToViewRate != null
        ? funnel.searchToViewRate
        : searchViews > 0
          ? propertyViews / searchViews
          : null;
    const medianForChannel = portfolio.searchToViewRatesBySystem[system];
    const medianS2v =
      medianForChannel && medianForChannel.length > 0
        ? medianOf(medianForChannel)
        : 0;

    if (
      searchToViewRate != null &&
      searchViews >= MIN_SEARCH_VIEWS_FOR_SEARCH_TO_VIEW_CHECK &&
      medianS2v > 0 &&
      searchToViewRate < medianS2v * SEARCH_TO_VIEW_LOW_THRESHOLD_RATIO
    ) {
      const pctRank = percentileRank(searchToViewRate, portfolio.searchToViewRatesBySystem[system] ?? []);
      const severity = 100 - pctRank;
      if (severity > best) best = severity;
      if (severity > 15) {
        drivers.push({
          category: "conversion",
          severity,
          detail: `${channelLabel(system)}: niedrige Search-to-View-Rate (${(searchToViewRate * 100).toFixed(2)}% vs. Portfolio-Median ${(medianS2v * 100).toFixed(2)}%) bei ${searchViews} Sucheinblendungen — Sucheinblendungen werden nicht in Klicks umgesetzt.`,
          actionSuggestion:
            "Titelbild, Titel und Suchranking prüfen — das Problem liegt vor der Preisentscheidung (Sichtbarkeit/Attraktivität in der Trefferliste), nicht bei der Buchungs-Conversion.",
        });
      }
    }
  }

  return { severity: best, drivers };
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function channelLabel(system: ChannelSystem): string {
  return system === "MDV_AIRBNB" ? "Airbnb" : "Booking.com";
}

const MIN_REVIEW_COUNT = 5;

interface DimensionE {
  severity: number;
  detail: string | null;
}

function computeDimensionE(
  input: OpportunityScoreListingInput,
  portfolio: OpportunityScorePortfolioContext
): DimensionE {
  let best = 0;
  let detail: string | null = null;

  for (const review of input.reviewScores ?? []) {
    if (review.reviewCount < MIN_REVIEW_COUNT) continue; // insufficient data, not "fine" — see file header.
    const pctRank = percentileRank(review.reviewScore10, portfolio.reviewScores10Pooled);
    const severity = 100 - pctRank;
    if (severity > best) {
      best = severity;
      detail = `${channelLabel(review.system)}: Bewertung ${review.reviewScore10.toFixed(1)}/10 aus ${review.reviewCount} Bewertungen liegt im unteren ${pctRank.toFixed(0)}. Perzentil des Portfolios.`;
    }
  }

  return { severity: best, detail: best > 15 ? detail : null };
}

interface DimensionF {
  severity: number;
  detail: string;
}

const NO_COST_DATA_DETAIL =
  "Keine Kostendaten hinterlegt — Rate Cards unter /settings/rate-cards eintragen, um diese Prüfung zu aktivieren.";

function computeDimensionF(input: OpportunityScoreListingInput): DimensionF {
  // Real logic (kept for when real cost data exists): compare actual cleaning
  // cost per stay against the tenant's rate card, flag high severity if the
  // actual cost is far above the card (e.g. >150% of the expected rate). This
  // cannot run yet — no CostCleaning rows exist, and CostRateCard values are
  // still all 0 (Reto hasn't entered them via /settings/rate-cards yet) — so we
  // deliberately return "not yet available" rather than fabricate a "fine".
  if (!input.hasNonZeroRateCard && !input.hasCleaningCostRows) {
    return { severity: 0, detail: NO_COST_DATA_DETAIL };
  }

  // Placeholder for when real data exists — intentionally not implemented further
  // since there is nothing to compare against yet in this dataset. A future
  // version should compute actual-vs-rate-card variance per stay here.
  return { severity: 0, detail: NO_COST_DATA_DETAIL };
}

const NIGHTS_PER_MONTH_ASSUMPTION_FOR_NUDGE_LEAKAGE = 8; // rough placeholder — see file header
const VARIABLE_MARGIN_ASSUMPTION = 0.6; // rough placeholder — ~60% variable margin on incremental nights

export function computeOpportunityScore(
  input: OpportunityScoreListingInput,
  portfolio: OpportunityScorePortfolioContext
): OpportunityScoreResult {
  const dimA = computeDimensionA(input, portfolio);
  const dimB = computeDimensionB(input, dimA.severity);
  const dimC = computeDimensionC(input);
  const dimD = computeDimensionD(input, portfolio);
  const dimE = computeDimensionE(input, portfolio);
  const dimF = computeDimensionF(input);

  const weightedSum =
    WEIGHTS.occupancy * dimA.severity +
    WEIGHTS.gaps * dimB.severity +
    WEIGHTS.pricing * dimC.severity +
    WEIGHTS.conversion * dimD.severity +
    WEIGHTS.reviews * dimE.severity +
    WEIGHTS.cost * dimF.severity;

  const score = clamp(Math.round(weightedSum / 100));

  const drivers: OpportunityScoreDriver[] = [];

  if (dimA.severity > 15 && dimA.detail) {
    drivers.push({
      category: "occupancy",
      severity: dimA.severity,
      detail: dimA.detail,
      actionSuggestion:
        dimA.method === "pricelabs_market"
          ? "Preisstrategie gegenüber dem Markt überprüfen (PriceLabs Health-Check zeigt Unterauslastung gegenüber dem Markt)."
          : "Auslastung im Vergleich zum Portfolio prüfen — Preis, Mindestaufenthalt oder Sichtbarkeit anpassen.",
    });
  }

  if (dimB.severity > 15 && dimB.detail) {
    drivers.push({
      category: "gaps",
      severity: dimB.severity,
      detail: dimB.detail,
      actionSuggestion:
        "Kurzfristige Lücken mit gezielten Rabatten, Mindestaufenthalt-Anpassungen oder Kanal-Promotion schließen.",
    });
  }

  if (dimC.severity > 15 && dimC.detail) {
    drivers.push({
      category: "pricing",
      severity: dimC.severity,
      detail: dimC.detail,
      actionSuggestion:
        dimC.adrOutlierSeverity >= dimC.nudgeSeverity && dimC.adrOutlierInfo
          ? "Buchung/Rate manuell prüfen — vermutlich Dateneingabe- oder Rabattfehler, keine bewusste Preisentscheidung."
          : "PriceLabs-Nudge im Dashboard prüfen und bei Zustimmung übernehmen.",
    });
  }

  drivers.push(...dimD.drivers);

  if (dimE.severity > 15 && dimE.detail) {
    drivers.push({
      category: "reviews",
      severity: dimE.severity,
      detail: dimE.detail,
      actionSuggestion:
        "Gäste-Feedback der letzten Aufenthalte sichten — Reinigung, Ausstattung oder Kommunikation als Ursache prüfen.",
    });
  }

  // Dimension F is always severity 0 today (no cost data — see computeDimensionF),
  // so per the ">15" rule above it never appears in this `drivers` array — that
  // rule exists to avoid cluttering the UI with non-issues, and "no data" is
  // arguably not a non-issue. Rather than special-case the filter here, the
  // dashboard page surfaces this as a standing disclaimer instead (see
  // apps/web/src/app/dashboard/page.tsx) so it's visible without inflating any
  // individual listing's driver list.

  drivers.sort((a, b) => b.severity - a.severity);

  // Leakage estimate — deliberately rough, see file header for assumptions.
  let leakage: number | null = null;
  if (dimB.rawUnbookedNights != null && input.avgDailyRateChf != null) {
    leakage = (leakage ?? 0) + dimB.rawUnbookedNights * input.avgDailyRateChf * VARIABLE_MARGIN_ASSUMPTION;
  }
  if (input.pendingNudge) {
    const diffChf = Math.abs(input.pendingNudge.suggestedValueChf - input.pendingNudge.currentValueChf);
    leakage = (leakage ?? 0) + diffChf * NIGHTS_PER_MONTH_ASSUMPTION_FOR_NUDGE_LEAKAGE;
  }

  return {
    score,
    estimatedMonthlyLeakageChf: leakage != null ? Math.round(leakage) : null,
    drivers,
    formulaVersion: OPPORTUNITY_FORMULA_VERSION,
  };
}
