/**
 * Typed MyDataValue (MDV) REST client (Phase 1 stub).
 *
 * IMPORTANT — open item: MDV's `list_properties` spans MULTIPLE account_name
 * values on this org's account (confirmed live: "Reto Wyss", "Henrik Sugiyo",
 * "Rachel Wyss", "Mile Ignjatic", "revtech17", "myDataValueBot"). This client
 * MUST be scoped to only the account_name(s) confirmed as belonging to "The R"
 * tenant — do not assume it's just "Reto Wyss". Get explicit confirmation
 * before wiring the real sync job (see Open Items in the architecture doc).
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
