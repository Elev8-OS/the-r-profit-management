/**
 * Typed MyDataValue (MDV) REST client (Phase 1 stub).
 *
 * Account scoping — CONFIRMED (2026-08-06): "The R" tenant corresponds to
 * account_name "Reto Wyss" only. MDV's `list_properties` on the connected
 * account also returns other, unrelated sub-accounts ("Henrik Sugiyo",
 * "Rachel Wyss", "Mile Ignjatic", "revtech17", "myDataValueBot") — those must
 * be filtered out. Set MDV_ALLOWED_ACCOUNT_NAMES=Reto Wyss (see .env.example)
 * and always construct this client with that value; never default to "all".
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
