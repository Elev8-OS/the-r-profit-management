/**
 * Typed MyDataValue (MDV) REST client.
 *
 * Account scoping — CONFIRMED (2026-08-06): "The R" tenant corresponds to
 * account_name "Reto Wyss" only. MDV's `list_properties` on the connected
 * account also returns other, unrelated sub-accounts ("Henrik Sugiyo",
 * "Rachel Wyss", "Mile Ignjatic", "revtech17", "myDataValueBot") — those must
 * be filtered out. Set MDV_ALLOWED_ACCOUNT_NAMES=Reto Wyss (see .env.example)
 * and always construct this client with that value; never default to "all".
 *
 * Write access — CONFIRMED (2026-08-07): MyDataValue support granted this
 * account genuine OAuth2 write access (client_credentials-style client_id +
 * client_secret, exchanged together with a rotating refresh_token — see
 * MdvTokenManager in ./tokenManager.ts for the full rotation/concurrency
 * story). This client no longer takes a static API key; it takes a
 * `getAccessToken()` callback so callers can share one MdvTokenManager
 * across every request instead of each client managing its own token.
 *
 * NOT yet confirmed: the exact request/response shape of the write
 * endpoints themselves (pricing/promotion updates) and of the read
 * endpoints below other than the token exchange — MDV's docs page exists
 * (a private, key-gated URL Reto has access to) but automated fetching of
 * it is blocked by that site's robots.txt, so it has to be read by a human
 * and pasted in, or accessed by Reto directly. Per this file's long-standing
 * rule: do not guess at endpoint paths or payload shapes the way the
 * initial PriceLabs occupancy-field parsing was guessed and had to be fixed
 * after a live run — every method below stays a clearly-labeled stub until
 * its real shape is confirmed.
 */
import type { MdvTokenManager } from "./tokenManager";

export interface MdvProperty {
  channel: "booking" | "airbnb";
  externalId: string;
  accountName: string;
  name: string;
}

export class MdvApiError extends Error {
  constructor(message: string, public status?: number, public body?: unknown) {
    super(message);
    this.name = "MdvApiError";
  }
}

export class MdvClient {
  constructor(
    private tokenManager: MdvTokenManager,
    private tenantId: string,
    private allowedAccountNames: string[],
    // Inferred from the docs URL (app.mydatavalue.com/api/v1/docs/) and the
    // confirmed oauth/token host — NOT yet verified against a real
    // successful API call. Override via constructor if the docs say
    // otherwise once read.
    private baseUrl = "https://app.mydatavalue.com/api/v1"
  ) {}

  /** Authenticated fetch helper every real endpoint method below should use once its path/shape is confirmed. */
  private async authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const accessToken = await this.tokenManager.getValidAccessToken(this.tenantId);
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
    });
    if (!res.ok) {
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // ignore
      }
      if (res.status === 429) {
        throw new MdvApiError("MyDataValue rate limit hit (429) — honor Retry-After and back off.", 429, body);
      }
      throw new MdvApiError(`MyDataValue API error ${res.status}`, res.status, body);
    }
    return res;
  }

  async listProperties(): Promise<MdvProperty[]> {
    throw new Error(
      "Not implemented — OAuth2 write access and the token pipeline (MdvTokenManager) are wired, but the exact " +
        "/api/v1/... path and response shape for listing properties still needs to come from MDV's docs (blocked " +
        "for automated fetch by robots.txt — paste the relevant section in). Filter the result to this.allowedAccountNames."
    );
  }

  async getPromotions(propertyId: string): Promise<unknown> {
    throw new Error(
      "Not implemented — see get_promotions in the read-only MDV MCP for the general shape, but the customer REST " +
        "API's own path/response needs confirming from MDV's docs before wiring this up."
    );
  }

  async updatePromotion(propertyId: string, promotion: unknown): Promise<void> {
    throw new Error(
      "Not implemented — Phase 3 (one-click push). Needs the confirmed write endpoint path + request body shape " +
        "from MDV's docs before this can be written for real, and must stay gated behind explicit user approval " +
        "(ConfirmActionButton) exactly like the PriceLabs push actions."
    );
  }
}
