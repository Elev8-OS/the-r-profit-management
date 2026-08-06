/**
 * Typed PriceLabs REST client (Phase 1 stub).
 *
 * NOTE: this calls PriceLabs' documented public REST API directly, NOT the
 * agent-facing MCP tools used during planning/prototyping — MCP is the wrong
 * access pattern for a cron worker polling ~90 listings on a schedule.
 * Auth: PriceLabs API key, set via PRICELABS_API_KEY.
 */
export interface PriceLabsListing {
  listingId: string;
  pmsName: string;
  listingName: string;
  propertyName: string;
}

export class PriceLabsClient {
  constructor(private apiKey: string, private baseUrl = "https://api.pricelabs.co") {}

  async listListings(): Promise<PriceLabsListing[]> {
    throw new Error(
      "Not implemented: wire to PriceLabs' documented REST API (see https://developers.pricelabs.co). " +
        "Confirm rate limits before enabling scheduled polling across the full portfolio."
    );
  }

  async getAvailableNudges(listingId: string): Promise<unknown[]> {
    throw new Error("Not implemented — see get_available_nudges in the PriceLabs MCP for the expected shape.");
  }

  async acceptNudge(listingId: string, nudgeId: string): Promise<void> {
    throw new Error("Not implemented — Phase 3 (one-click push). Must be gated behind explicit user approval.");
  }

  async setDateOverrides(
    listingId: string,
    overrides: Array<{ date: string; price: number; minStay?: number }>
  ): Promise<void> {
    throw new Error("Not implemented — Phase 3 (one-click push). Must be gated behind explicit user approval.");
  }
}
