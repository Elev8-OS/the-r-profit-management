/**
 * MyDataValue OAuth2 access-token manager.
 *
 * Confirmed 2026-08-07 by MyDataValue support (the account's write access
 * was just granted): every exchange at MDV's token endpoint returns a NEW
 * access_token (1h validity) AND a NEW refresh_token, and the OLD
 * refresh_token is invalidated immediately — reusing an old one is treated
 * as a stolen-token event and shuts down API access entirely (recoverable
 * only by contacting MDV support for re-issuance). That single-use rotation
 * is the whole reason this file exists instead of a one-line "if expired,
 * refresh" helper: this app runs at least two processes (apps/web,
 * apps/worker) that could both decide to refresh at the same moment, and if
 * they raced on the same refresh_token, MDV would honor exactly one
 * exchange and the other process's call would fail *after* the token it
 * was about to use had already been rotated out from under it — a real risk
 * of accidentally shutting down the account's access.
 *
 * This class is intentionally storage-agnostic (see MdvTokenStore below) —
 * it has no Prisma/@the-r/db dependency, matching this package's existing
 * "pure REST client" layering. The concrete Prisma-backed store lives in
 * @the-r/db (packages/db/src/mdvTokenStore.ts) so apps/web and apps/worker
 * can both build an MdvTokenManager against the exact same underlying row
 * without this package needing to know about Prisma at all.
 *
 * Concurrency approach: optimistic-concurrency claim (compare-and-swap on
 * `version`) before ever calling MDV's token endpoint. Exactly one process
 * wins the claim and performs the exchange; every other process that needed
 * a fresh token at the same moment polls the store instead of attempting
 * its own competing exchange, until the winner's result is visible.
 */

export interface MdvOAuthRecord {
  id: string;
  refreshToken: string;
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
  version: number;
}

export interface MdvTokenStore {
  /** Read the row for this tenant, creating it (seeded from the one-time initial refresh token) if it doesn't exist yet. */
  getOrCreate(tenantId: string, initialRefreshToken: string): Promise<MdvOAuthRecord>;
  /** Re-read the current row by id — used while polling for another process's in-flight refresh to land. */
  reload(id: string): Promise<MdvOAuthRecord | null>;
  /**
   * Atomic compare-and-swap: succeeds (returns true) and increments the
   * stored version only if it still equals `expectedVersion`. This is the
   * mutual-exclusion primitive — only the caller whose claim succeeds may
   * call MDV's token endpoint next; everyone else must not.
   */
  claim(id: string, expectedVersion: number): Promise<boolean>;
  /** Persist newly-issued tokens after a successful exchange. Called only by the process that won the claim. */
  save(id: string, data: { refreshToken: string; accessToken: string; accessTokenExpiresAt: Date }): Promise<void>;
}

export class MdvOAuthError extends Error {
  constructor(message: string, public status?: number, public body?: unknown) {
    super(message);
    this.name = "MdvOAuthError";
  }
}

const TOKEN_URL = "https://app.mydatavalue.com/oauth/token";
// Refresh a little before actual expiry so a slow request never starts with
// a token that expires mid-flight.
const EXPIRY_SAFETY_BUFFER_MS = 60_000;
const CLAIM_POLL_INTERVAL_MS = 400;
const CLAIM_POLL_TIMEOUT_MS = 8_000;

export class MdvTokenManager {
  constructor(
    private store: MdvTokenStore,
    private clientId: string,
    private clientSecret: string,
    private initialRefreshToken: string
  ) {
    if (!clientId || !clientSecret || !initialRefreshToken) {
      throw new Error(
        "MdvTokenManager requires clientId, clientSecret, and an initial refresh token (MDV_CLIENT_ID / MDV_CLIENT_SECRET / MDV_INITIAL_REFRESH_TOKEN)"
      );
    }
  }

  /** Returns a currently-valid access_token for this tenant, refreshing (with the CAS/poll dance above) if needed. */
  async getValidAccessToken(tenantId: string): Promise<string> {
    const record = await this.store.getOrCreate(tenantId, this.initialRefreshToken);

    if (
      record.accessToken &&
      record.accessTokenExpiresAt &&
      record.accessTokenExpiresAt.getTime() - EXPIRY_SAFETY_BUFFER_MS > Date.now()
    ) {
      return record.accessToken;
    }

    const claimed = await this.store.claim(record.id, record.version);
    if (claimed) {
      // We now hold the exclusive right to exchange record.refreshToken —
      // no one else should be attempting this at the same time.
      const fresh = await this.exchangeRefreshToken(record.refreshToken);
      await this.store.save(record.id, fresh);
      return fresh.accessToken;
    }

    // Someone else claimed the refresh just now — poll for their result
    // rather than racing them with our own exchange call.
    const deadline = Date.now() + CLAIM_POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(CLAIM_POLL_INTERVAL_MS);
      const reloaded = await this.store.reload(record.id);
      if (
        reloaded?.accessToken &&
        reloaded.accessTokenExpiresAt &&
        reloaded.accessTokenExpiresAt.getTime() > Date.now()
      ) {
        return reloaded.accessToken;
      }
    }
    throw new MdvOAuthError("Timed out waiting for a concurrent MyDataValue token refresh to complete.");
  }

  private async exchangeRefreshToken(
    refreshToken: string
  ): Promise<{ refreshToken: string; accessToken: string; accessTokenExpiresAt: Date }> {
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString(),
    });

    if (!res.ok) {
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // ignore
      }
      throw new MdvOAuthError(
        `MyDataValue OAuth token exchange failed (${res.status}). If this refresh_token had already been used by another process, MDV access may now be shut down and require re-issuance via MDV support.`,
        res.status,
        body
      );
    }

    const data = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!data.access_token || !data.refresh_token) {
      throw new MdvOAuthError("MyDataValue OAuth token response missing access_token/refresh_token", 200, data);
    }
    const expiresInSeconds = typeof data.expires_in === "number" ? data.expires_in : 3600;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessTokenExpiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
