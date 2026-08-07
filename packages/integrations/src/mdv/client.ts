/**
 * Typed MyDataValue (MDV) REST client (Phase 1 stub).
 *
 * Account scoping — CONFIRMED (2026-08-06): "The R" tenant corresponds to
 * account_name "Reto Wyss" only. MDV's `list_properties` on the connected
 * account also returns other, unrelated sub-accounts ("Henrik Sugiyo",
 * "Rachel Wyss", "Mile Ignjatic", "revtech17", "myDataValueBot") — those must
 * be filtered out. Set MDV_ALLOWED_ACCOUNT_NAMES=Reto Wyss (see .env.example)
 * and always construct this client with that value; never default to "all".
 *
 * API existence — CONFIRMED (2026-08-07): unlike Elev8, MyDataValue does
 * have a real structured REST API — the MCP connector's `mdv_raw_get` tool
 * documents live paths like `/api/v1/sync-jobs/{job_id}/`, `/api/v1/tags/`,
 * and webhook endpoints, so this isn't a dead end the way Elev8's public API
 * was. NOT yet confirmed: the exact base URL/auth header this app should use
 * (the MCP connector's own auth is opaque to us), and whether write
 * endpoints exist at all — every MDV MCP tool available today (get_pricing,
 * get_promotions, get_demand, etc.) is read-only; there is no
 * update_promotion/set_price equivalent, unlike PriceLabs which has both a
 * documented Customer API and confirmed write endpoints. Before wiring this
 * up for real: (1) ask MyDataValue support/account settings for a customer
 * API key (mirrors how the PriceLabs key was obtained) and their API docs,
 * (2) confirm the write endpoints exist and get their exact shape — do not
 * guess at those the way the initial PriceLabs occupancy-field parsing was
 * guessed and had to be fixed after a live run.
 */
export interface MdvProperty {
  channel: "booking" | "airbnb";
  externalId: string;
  accountName: string;
  name: string;
}

export class MdvClient {
  constructor(
    private apiKey: string,
    private allowedAccountNames: string[],
    private baseUrl = "https://api.mydatavalue.com"
  ) {}

  async listProperties(): Promise<MdvProperty[]> {
    throw new Error(
      "Not implemented: wire to MyDataValue's REST API, then filter to this.allowedAccountNames only."
    );
  }

  async getPromotions(propertyId: string): Promise<unknown> {
    throw new Error("Not implemented — see get_promotions in the MDV MCP for the expected shape.");
  }

  async updatePromotion(propertyId: string, promotion: unknown): Promise<void> {
    throw new Error("Not implemented — Phase 3 (one-click push). Must be gated behind explicit user approval.");
  }
}
