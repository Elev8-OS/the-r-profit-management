export type ExternalSystem = "PRICELABS" | "MDV_AIRBNB" | "MDV_BOOKING" | "ELEV8";

export interface ProfitParInput {
  revenue: number;
  fixedCostAllocated: number;
  cleaningCost: number;
  managementFee: number;
  capexAllocated: number;
  availableRoomNights: number;
}

export interface ProfitParResult {
  revpar: number;
  operatingProfitPar: number;
  fullyLoadedProfitPar: number;
  formulaVersion: string;
}
