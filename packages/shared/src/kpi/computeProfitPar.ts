import type { ProfitParInput, ProfitParResult } from "../types";

/**
 * Profit PAR formulas — v1.
 *
 * IMPORTANT: capexAmortization, cleaning rate cards, and management-fee %
 * are business decisions, not engineering defaults. Do not change the
 * formula shape below without bumping FORMULA_VERSION so historical
 * KpiDailySnapshot rows remain comparable.
 *
 * - RevPAR = Revenue / Available Room-Nights
 * - Operating Profit PAR = (Revenue - FixedCosts - CleaningCosts - ManagementFee) / Available Room-Nights
 *     -> the primary metric for pricing decisions. Capex is deliberately excluded
 *        because it isn't pricing-relevant on a day-to-day basis.
 * - Fully-Loaded Profit PAR = Operating Profit PAR - (CapexAllocated / Available Room-Nights)
 *     -> secondary "true P&L" metric for owner-level reporting.
 */
export const FORMULA_VERSION = "v1";

export function computeProfitPar(input: ProfitParInput): ProfitParResult {
  const {
    revenue,
    fixedCostAllocated,
    cleaningCost,
    managementFee,
    capexAllocated,
    availableRoomNights,
  } = input;

  if (availableRoomNights <= 0) {
    return {
      revpar: 0,
      operatingProfitPar: 0,
      fullyLoadedProfitPar: 0,
      formulaVersion: FORMULA_VERSION,
    };
  }

  const revpar = revenue / availableRoomNights;

  const operatingProfit = revenue - fixedCostAllocated - cleaningCost - managementFee;
  const operatingProfitPar = operatingProfit / availableRoomNights;

  const fullyLoadedProfitPar = operatingProfitPar - capexAllocated / availableRoomNights;

  return {
    revpar,
    operatingProfitPar,
    fullyLoadedProfitPar,
    formulaVersion: FORMULA_VERSION,
  };
}

/**
 * The minimum price per night below which a stay is not worth accepting,
 * used as a guardrail by the recommendation engine (see rule 3 and 6 in the plan):
 * never recommend a price below cost recovery, regardless of what
 * PriceLabs/MyDataValue's own algorithms suggest.
 */
export function computeMinimumViablePrice(params: {
  cleaningCostPerStay: number;
  commissionRatePct: number; // e.g. 0.15 for 15%
  managementFeeRatePct: number; // e.g. 0.20 for 20%
  averageLengthOfStayNights: number;
  marginBufferPct?: number; // default small buffer, e.g. 0.10
}): number {
  const {
    cleaningCostPerStay,
    commissionRatePct,
    managementFeeRatePct,
    averageLengthOfStayNights,
    marginBufferPct = 0.1,
  } = params;

  if (averageLengthOfStayNights <= 0) return 0;

  const combinedRate = 1 - commissionRatePct - managementFeeRatePct;
  if (combinedRate <= 0) {
    // Degenerate config — fees exceed 100%; surface as "no viable price" rather than divide by <=0.
    return Infinity;
  }

  const costRecoveryPerNight = cleaningCostPerStay / averageLengthOfStayNights / combinedRate;
  return costRecoveryPerNight * (1 + marginBufferPct);
}
