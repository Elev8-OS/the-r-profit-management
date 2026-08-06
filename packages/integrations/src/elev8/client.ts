/**
 * Typed Elev8 Suite client (Phase 1 stub).
 *
 * BLOCKER (see architecture doc, Open Items #3): as of this writing there is
 * no confirmed general public REST/GraphQL API for Elev8 Suite — only PMS
 * integration guides (Beds24, Guesty). This client cannot be implemented for
 * real production polling until Elev8 Suite engineering provides either:
 *   (a) a service-to-service API key/endpoint, or
 *   (b) a read replica / data export.
 * Until then, do NOT call the agent-facing Elev8 Suite MCP tools from this
 * worker in production — they're proxied through a device bridge / session
 * context and are not designed for unattended scheduled polling.
 */
export interface Elev8ListingOverview {
  listingId: string;
  listingName: string;
  country: string | null;
  currency: string | null;
  city: string | null;
}

export class Elev8Client {
  constructor(private apiKey: string, private baseUrl: string) {
    throw new Error(
      "Blocked: no confirmed Elev8 Suite service API exists yet. Get a service credential or " +
        "read-replica access from Elev8 Suite engineering before implementing this client."
    );
  }

  async listListingsOverview(): Promise<Elev8ListingOverview[]> {
    throw new Error("Blocked — see constructor note.");
  }

  async getCleaningDurationDetail(listingId: string): Promise<unknown> {
    throw new Error("Blocked — see constructor note.");
  }
}
