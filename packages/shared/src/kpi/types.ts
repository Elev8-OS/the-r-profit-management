// Types for the Opportunity Score — see computeOpportunityScore.ts for the formula
// itself and worked examples. Kept in a separate file (next to computeProfitPar's
// types, which live in the top-level ../types.ts) because this input shape is large
// and specific to this one formula.

export type ChannelSystem = "MDV_BOOKING" | "MDV_AIRBNB";

/** One PriceLabs market-health check result for a listing (see PriceLabsHealthSnapshot). */
export interface OpportunityHealthSignal {
  statusColor: "Red" | "Yellow" | "Green" | "Blue";
  statusText: string;
}

/** A pending PriceLabs base-price nudge for a listing (see PriceLabsNudge). */
export interface OpportunityNudgeSignal {
  currentValue: number;
  suggestedValue: number;
  /** Same figures converted to CHF via FxRate, for the leakage-CHF estimate. */
  currentValueChf: number;
  suggestedValueChf: number;
}

/**
 * min/median/max avg_daily_rate for one listing within one currency, computed by
 * the caller from elev8PerformanceSummaryAug2026.json (grouped by listing_id, then
 * by currency). Only meaningful with >=2 samples; a single-sample group always has
 * min === median === max and can never trigger the outlier check, which is correct.
 */
export interface OpportunityAdrStats {
  currency: string;
  min: number;
  median: number;
  max: number;
}

/** One MyDataValue channel-funnel snapshot for a listing (see ListingChannelFunnel). */
export interface OpportunityFunnelSignal {
  system: ChannelSystem;
  searchViews: number;
  propertyViews: number;
  bookingConversions: number;
  /** Airbnb ranking already provides these; Booking.com does not (derive from raw counts). */
  viewToBookingRate?: number | null;
  searchToViewRate?: number | null;
}

/** One MyDataValue review-score snapshot for a listing (see ListingReviewScore). */
export interface OpportunityReviewSignal {
  system: ChannelSystem;
  /** Already normalized to a 0-10 scale (Airbnb's 0-5 * 2). */
  reviewScore10: number;
  reviewCount: number;
}

export interface OpportunityScoreListingInput {
  internalListingId: string;
  listingName: string;

  /** Dimension A primary signal. Absent for most listings today (sample data only). */
  priceLabsHealth?: OpportunityHealthSignal | null;
  /** Dimension A fallback: this listing's own current-month occupancy_pct (0-100). */
  ownOccupancyPct?: number | null;

  /** Dimension B: nights unbooked out of the next 30, from Elev8's gap calendar. */
  unbookedNightsNext30?: number | null;
  /** This listing's typical nightly rate in CHF, for the near-term-gap CHF estimate. */
  avgDailyRateChf?: number | null;

  /** Dimension C inputs. */
  pendingNudge?: OpportunityNudgeSignal | null;
  adrStatsByCurrency?: OpportunityAdrStats[];

  /** Dimension D inputs — one entry per channel this listing is linked to. */
  channelFunnels?: OpportunityFunnelSignal[];

  /** Dimension E inputs — one entry per channel this listing is linked to. */
  reviewScores?: OpportunityReviewSignal[];

  /** Dimension F inputs. Both are always false/empty today — see formula comments. */
  hasNonZeroRateCard: boolean;
  hasCleaningCostRows: boolean;
}

/**
 * Portfolio-wide context needed for the percentile-ranking dimensions (D and E) and
 * the Dimension-A fallback median. The caller (seedOpportunitySignals.ts) assembles
 * this once from every matched listing and passes the same object to every
 * computeOpportunityScore() call so percentiles are consistent across the run.
 */
export interface OpportunityScorePortfolioContext {
  /** Portfolio median of ownOccupancyPct across all listings with occupancy data. */
  medianOccupancyPct: number;
  /** Per-channel view->booking conversion rates, portfolio-wide, propertyViews >= 50 only. */
  conversionRatesBySystem: Record<ChannelSystem, number[]>;
  /** Per-channel search->view rates, portfolio-wide (searchViews > 0). */
  searchToViewRatesBySystem: Record<ChannelSystem, number[]>;
  /** reviewScore10 pooled across both channels, portfolio-wide, reviewCount >= 5 only. */
  reviewScores10Pooled: number[];
}

export interface OpportunityScoreDriver {
  category: "occupancy" | "gaps" | "pricing" | "conversion" | "reviews" | "cost";
  /** 0-100, this driver's own severity (not weighted). */
  severity: number;
  detail: string;
  actionSuggestion: string;
}

export interface OpportunityScoreResult {
  /** 0-100, higher = more urgent. */
  score: number;
  /** Rough placeholder estimate — see formula comments for assumptions. Null if no inputs to estimate from. */
  estimatedMonthlyLeakageChf: number | null;
  /** Sorted severity descending, only entries with severity > 15. */
  drivers: OpportunityScoreDriver[];
  formulaVersion: string;
}
