/**
 * Typed PriceLabs REST client — talks to the real PriceLabs Customer API
 * (https://api.pricelabs.co), confirmed 2026-08-07 against PriceLabs' own
 * OpenAPI spec (https://app.swaggerhub.com/apis/Customer_API/customer_api).
 * This is NOT the agent-facing MCP tool set used during planning/prototyping
 * — MCP is tied to an interactive Claude session; this client is what the
 * always-on worker service and the dashboard's push actions actually call.
 *
 * Auth: `X-API-Key` header, key from PriceLabs Account Settings > API
 * Details, set via the PRICELABS_API_KEY env var. PriceLabs bills $1/month
 * per synced listing for API access (confirmed via their own docs).
 *
 * Rate limit: 60 requests/minute (1000/hour). `PriceLabsClient.pace()` is a
 * plain delay helper — callers doing a full-portfolio sweep must await it
 * between calls. This client does not auto-retry on 429; callers should
 * treat PriceLabsApiError with status 429 as "back off and resume later".
 *
 * IMPORTANT — nudges: the public Customer API has NO nudge-specific
 * endpoints. There is no REST equivalent of the MCP tools
 * `get_available_nudges` / `accept_nudge` — confirmed by reading the full
 * OpenAPI spec (paths cover listings, prices, overrides, neighborhood data,
 * reservations, and report builder only). Those MCP tools reach an internal
 * PriceLabs surface this API key cannot reach.
 *
 * What the Customer API DOES give us, and what this client uses instead:
 * `GET /v1/listings` returns both the currently configured `base` price and
 * a `recommended_base_price` for every listing — this is functionally the
 * same "PriceLabs thinks your price should be X" signal a nudge represents.
 * "Accepting" it here means calling `updateListingBasePrice()` to push
 * `recommendedBasePrice` as the new `base`. The worker's syncPriceLabs job
 * stores this as an "implied nudge" (PriceLabsNudge row with an
 * `implied-base-*` id) so the existing Recommendation/push UI keeps working
 * unchanged. If Reto's dev confirms PriceLabs' literal in-app "Nudges"
 * feature is reachable some other way later, this is the place to extend.
 */

export interface PriceLabsListing {
  id: string;
  pms: string;
  name: string;
  currency: string | null;
  base: number | null;
  min: number | null;
  max: number | null;
  recommendedBasePrice: number | null;
  occupancyNext7: number | null;
  marketOccupancyNext7: number | null;
  occupancyNext30: number | null;
  marketOccupancyNext30: number | null;
  occupancyNext60: number | null;
  marketOccupancyNext60: number | null;
  occupancyNext90: number | null;
  marketOccupancyNext90: number | null;
  revenuePast7: number | null;
  lastRefreshedAt: string | null;
  /** Full untouched payload for this listing, for anything not mapped above. */
  raw: Record<string, unknown>;
}

export interface PriceLabsDateOverrideInput {
  date: string; // YYYY-MM-DD
  price: number;
  priceType?: "fixed" | "percent";
  /**
   * Required by PriceLabs whenever priceType is "fixed" (the default) — an
   * absolute-price override with no currency is rejected with a 400 (error
   * code "DSO-CUR-MS", confirmed live 2026-08-08 when pushing a price
   * override for "The R Apartment Adlisberg" without this field). Not
   * required for priceType "percent".
   */
  currency?: string;
  minStay?: number;
  reason?: string;
}

export interface PriceLabsDateOverride {
  date: string;
  price: number | null;
  priceType: string | null;
  minStay: number | null;
  reason: string | null;
}

export interface PriceLabsDailyPrice {
  date: string;
  price: number | null;
  userPrice: number | null;
  minStay: number | null;
  bookingStatus: string | null;
  demandColor: string | null;
}

/** Comfortably under PriceLabs' 60 req/min limit. */
const RATE_LIMIT_DELAY_MS = 1100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PriceLabsApiError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
    this.name = "PriceLabsApiError";
  }
}

export class PriceLabsClient {
  constructor(private apiKey: string, private baseUrl = "https://api.pricelabs.co") {
    if (!apiKey) {
      throw new Error("PriceLabsClient requires an API key (set PRICELABS_API_KEY)");
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    // Native fetch has no default timeout — a stalled TCP connection to
    // PriceLabs would otherwise hang this call (and the whole nightly sync
    // job) forever with no error and no log line. 20s is generous for a
    // JSON API call; PriceLabs' own API has no documented SLA slower than that.
    const REQUEST_TIMEOUT_MS = 20_000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new PriceLabsApiError(
          `PriceLabs API request timed out after ${REQUEST_TIMEOUT_MS}ms on ${method} ${path}`,
          0,
          null
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (res.status === 429) {
      throw new PriceLabsApiError(
        "PriceLabs rate limit exceeded (60 requests/minute, 1000/hour)",
        429,
        await safeJson(res)
      );
    }
    if (!res.ok) {
      throw new PriceLabsApiError(
        `PriceLabs API error ${res.status} on ${method} ${path}`,
        res.status,
        await safeJson(res)
      );
    }
    return (await safeJson(res)) as T;
  }

  /**
   * GET /v1/listings — the entire portfolio in one call. Includes the
   * market-relative occupancy comparison (occupancy_next_N vs
   * market_occupancy_next_N) and recommended_base_price for every listing —
   * this is the real, full-portfolio replacement for the earlier 4-listing
   * manual PriceLabs health sample.
   */
  async listListings(): Promise<PriceLabsListing[]> {
    const data = await this.request<unknown>("GET", "/v1/listings");
    const rows = extractRows(data);
    return rows.map(mapListing);
  }

  async getListing(listingId: string): Promise<PriceLabsListing | null> {
    try {
      const data = await this.request<Record<string, unknown>>(
        "GET",
        `/v1/listings/${encodeURIComponent(listingId)}`
      );
      return mapListing(data);
    } catch (err) {
      if (err instanceof PriceLabsApiError && err.status === 404) return null;
      throw err;
    }
  }

  /** POST /v1/listing_prices — day-level prices/demand for one listing over a date range. */
  async getListingPrices(
    listingId: string,
    pms: string,
    dateFrom: string,
    dateTo: string
  ): Promise<PriceLabsDailyPrice[]> {
    const res = await this.request<unknown>("POST", "/v1/listing_prices", {
      listings: [{ id: listingId, pms, dateFrom, dateTo }],
    });
    const listingResult = Array.isArray(res) ? (res[0] as Record<string, unknown>) : (res as Record<string, unknown>);
    const rows = Array.isArray(listingResult?.data) ? (listingResult.data as Record<string, unknown>[]) : [];
    return rows.map((r) => ({
      date: String(r.date),
      price: numOrNull(r.price),
      userPrice: numOrNull(r.user_price),
      minStay: numOrNull(r.min_stay),
      bookingStatus: (r.booking_status as string) ?? null,
      demandColor: (r.demand_color as string) ?? null,
    }));
  }

  /** GET /v1/listings/{id}/overrides — currently configured date-specific overrides. */
  async getDateOverrides(listingId: string): Promise<PriceLabsDateOverride[]> {
    const data = await this.request<Record<string, unknown>>(
      "GET",
      `/v1/listings/${encodeURIComponent(listingId)}/overrides`
    );
    const rows = Array.isArray(data?.overrides) ? (data.overrides as Record<string, unknown>[]) : [];
    return rows.map((r) => ({
      date: String(r.date),
      price: numOrNull(r.price),
      priceType: (r.price_type as string) ?? null,
      minStay: numOrNull(r.min_stay),
      reason: (r.reason as string) ?? null,
    }));
  }

  /**
   * POST /v1/listings/{id}/overrides — WRITE. Pushes real date-specific price
   * overrides to PriceLabs, which then flow on to the connected PMS/channels.
   * This changes live prices. Must only ever be called from an explicit,
   * user-triggered server action (see apps/web recommendations actions) —
   * never from a scheduled job.
   *
   * PriceLabs requires `currency` on every override whose price_type is
   * "fixed" (our default) — confirmed live 2026-08-08 via a real 400 error
   * ("DSO-CUR-MS") when pushing a price override for "The R Apartment
   * Adlisberg" without it. Fail fast here with a clear message rather than
   * letting PriceLabs' opaque error (further obscured by Next.js's
   * production error redaction on the client) reach the user unexplained.
   */
  async setDateOverrides(
    listingId: string,
    pms: string,
    overrides: PriceLabsDateOverrideInput[]
  ): Promise<void> {
    for (const o of overrides) {
      if ((o.priceType ?? "fixed") === "fixed" && !o.currency) {
        throw new Error(
          `setDateOverrides: currency is required for date ${o.date} (price_type "fixed") — PriceLabs rejects a fixed-price override with no currency.`
        );
      }
    }
    await this.request("POST", `/v1/listings/${encodeURIComponent(listingId)}/overrides`, {
      pms,
      update_children: false,
      overrides: overrides.map((o) => ({
        date: o.date,
        price: String(o.price),
        price_type: o.priceType ?? "fixed",
        ...(o.currency ? { currency: o.currency } : {}),
        min_stay: o.minStay,
        reason: o.reason ?? "Set via The R profit management dashboard",
      })),
    });
  }

  /** DELETE /v1/listings/{id}/overrides — WRITE. Same explicit-trigger-only rule. */
  async deleteDateOverrides(listingId: string, pms: string, dates: string[]): Promise<void> {
    await this.request("DELETE", `/v1/listings/${encodeURIComponent(listingId)}/overrides`, {
      pms,
      update_children: false,
      overrides: dates.map((date) => ({ date })),
    });
  }

  /**
   * POST /v1/listings — WRITE. Updates the listing's configured base/min/max
   * price. Used to implement "accept nudge" — pushes recommendedBasePrice as
   * the new base, since the Customer API has no literal nudge-accept
   * endpoint (see file header). Same explicit-trigger-only rule.
   */
  async updateListingBasePrice(listingId: string, pms: string, base: number): Promise<void> {
    await this.request("POST", "/v1/listings", {
      listings: [{ id: listingId, pms, base }],
    });
  }

  /** Pacing helper for full-portfolio loops — await between calls to stay under 60 req/min. */
  static pace(): Promise<void> {
    return sleep(RATE_LIMIT_DELAY_MS);
  }
}

function extractRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  const obj = data as Record<string, unknown> | null;
  const nested = obj?.listings ?? obj?.data;
  return Array.isArray(nested) ? (nested as Record<string, unknown>[]) : [];
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * PriceLabs returns occupancy_next_N / market_occupancy_next_N as strings
 * like "47 %" (confirmed against real API output 2026-08-07), not numbers —
 * plain Number() on that string is NaN. This strips the "%" and parses the
 * remaining figure as a plain 0-100 percentage.
 */
function percentOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "unavailable") return null;
  const n = Number(trimmed.replace("%", "").trim());
  return Number.isFinite(n) ? n : null;
}

function mapListing(r: Record<string, unknown>): PriceLabsListing {
  const min = r.min as Record<string, unknown> | number | null | undefined;
  const max = r.max as Record<string, unknown> | number | null | undefined;
  return {
    id: String(r.id),
    pms: String(r.pms ?? ""),
    name: String(r.name ?? ""),
    currency: (r.currency as string) ?? null,
    base: numOrNull(r.base),
    min: numOrNull(typeof min === "object" && min !== null ? (min as Record<string, unknown>).price : min),
    max: numOrNull(typeof max === "object" && max !== null ? (max as Record<string, unknown>).price : max),
    recommendedBasePrice: numOrNull(r.recommended_base_price),
    occupancyNext7: percentOrNull(r.occupancy_next_7),
    marketOccupancyNext7: percentOrNull(r.market_occupancy_next_7),
    occupancyNext30: percentOrNull(r.occupancy_next_30),
    marketOccupancyNext30: percentOrNull(r.market_occupancy_next_30),
    occupancyNext60: percentOrNull(r.occupancy_next_60),
    marketOccupancyNext60: percentOrNull(r.market_occupancy_next_60),
    occupancyNext90: percentOrNull(r.occupancy_next_90),
    marketOccupancyNext90: percentOrNull(r.market_occupancy_next_90),
    revenuePast7: numOrNull(r.revenue_past_7),
    lastRefreshedAt: (r.last_refreshed_at as string) ?? null,
    raw: r,
  };
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
