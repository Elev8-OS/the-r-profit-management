/**
 * Typed Elev8 Suite client (Phase 1 stub).
 *
 * STATUS (2026-08-06): a service credential (ELEV8_API_KEY) has been provided
 * and is set on the `worker-app` Railway service — but the base URL/endpoint
 * and auth scheme (Bearer vs custom header; REST vs the MCP SSE endpoint at
 * mcp.elev8-suite.com) are NOT yet confirmed. Do not implement real HTTP
 * calls here until that's confirmed — get the exact base URL + auth header
 * format from Elev8 Suite engineering, then set ELEV8_API_BASE_URL and wire
 * the fetch calls below accordingly. Until then, do NOT call the agent-facing
 * Elev8 Suite MCP tools from this worker in production — they're proxied
 * through a device bridge / session context and are not designed for
 * unattended scheduled polling.
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
