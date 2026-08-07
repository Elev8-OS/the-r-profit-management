/**
 * Typed MyDataValue (MDV) REST client — built from the real OpenAPI spec MDV
 * support provided 2026-08-07 (`api1.yaml`, "MyDataValue" v0.1.0), not
 * guessed. Base URL: the spec's `servers: [{ url: /api/v1 }]` combined with
 * the docs' host gives `https://app.mydatavalue.com/api/v1`.
 *
 * IMPORTANT CORRECTION vs this file's earlier assumptions: the API has NO
 * endpoint to directly set a promotion/discount value or a specific nightly
 * price — `GET /booking/promotions/` and `GET /airbnb/promotions/` are
 * READ-ONLY (they report what MDV or the OTA already has configured, same as
 * the read-only MDV MCP connector used during planning). The team's actual
 * write surface for pricing/promotions is narrower and indirect — confirmed
 * by reading every path in the spec (34 total):
 *   - `PUT /booking/auto-refresh/` and `PUT /airbnb/auto-refresh/` — turn
 *     MDV's OWN nightly automated push on/off per property/listing. This
 *     hands control to MDV's pricing/promotion engine; it does not set any
 *     specific value itself.
 *   - `PUT /booking/guest-target/` — sets a "Guest Target %" per Booking.com
 *     property (Booking.com only, no Airbnb equivalent), which feeds MDV's
 *     own automation. Also not a literal discount/price push.
 * There is no "set this exact discount to X%" or "set this night's price to
 * Y" call anywhere in this API for either channel. Anything in this app's
 * AI-suggestion pipeline framed as MDV_DISCOUNT_CHANGE must map to one of
 * these two levers (or stay informational-only) — never assume a direct
 * value-push endpoint exists. See apps/web/src/app/listings/actions.ts.
 *
 * Auth: OAuth2.1 authorization code + PKCE — Bearer JWT access token (1h
 * validity), single-use rotating refresh_token. See MdvTokenManager
 * (./tokenManager.ts) for the exchange/rotation/concurrency handling this
 * client relies on.
 *
 * Team scoping: per the spec, an access token is scoped to exactly one
 * MyDataValue "team" at the OAuth consent step — reads/writes for anything
 * outside it 404, they never leak data cross-team. That is a stronger
 * boundary than the account_name filtering this app used against the
 * read-only MCP connector during planning (which surfaced several unrelated
 * sub-accounts on one shared connector). `PropertySummary.account_name` is
 * still exposed on Booking.com properties and kept here as an optional
 * defensive filter/display field (confirmed 2026-08-06: "The R" =
 * account_name "Reto Wyss") — but Airbnb listings from this API carry NO
 * account_name field at all, so account_name is not the primary tenancy
 * boundary here; the OAuth grant is.
 */
import type { MdvTokenManager } from "./tokenManager";

export interface BookingProperty {
  propertyId: number;
  name: string | null;
  city: string | null;
  accountName: string | null;
  guestTargetPct: number | null;
  commissionPct: number | null;
  status: string;
  extranetSynced: boolean;
  tags: string[];
}

export interface AirbnbListing {
  listingId: string;
  nickname: string | null;
  title: string | null;
  active: boolean | null;
  city: string | null;
  ratingAverage: number | null;
  reviewCount: number | null;
}

export interface BookingPromotion {
  propertyId: number;
  id: string;
  name: string | null;
  promotionType: string;
  discount: number | null;
  isActive: boolean;
}

export interface AirbnbPromotion {
  listingId: string;
  promotionId: string;
  promotionType: string;
  priceFactor: number | null;
  priceChange: number | null;
  startDate: string | null;
  endDate: string | null;
  minLengthOfStay: number | null;
  isActive: boolean;
}

export interface BookingPricingDay {
  date: string;
  prices: Array<{ occupancy: number | null; price: number }>;
}

export interface BookingPricing {
  rooms: Array<{ roomId: string; name: string | null }>;
  rates: Array<{ rateId: string; roomId: string; name: string | null; dates: BookingPricingDay[] }>;
  needsSync: boolean;
  syncNote: string;
  dataAsOf: string | null;
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
    /** Optional defensive filter for Booking.com properties only (see file header) — leave empty to trust the OAuth team-scoping alone. */
    private allowedAccountNames: string[] = [],
    private baseUrl = "https://app.mydatavalue.com/api/v1"
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const accessToken = await this.tokenManager.getValidAccessToken(this.tenantId);
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let responseBody: unknown = null;
      try {
        responseBody = await res.json();
      } catch {
        // ignore
      }
      const errorCode =
        responseBody && typeof responseBody === "object" && "error" in (responseBody as Record<string, unknown>)
          ? String((responseBody as Record<string, unknown>).error)
          : null;
      if (res.status === 429) {
        throw new MdvApiError("MyDataValue rate limit hit (429) — honor Retry-After and back off.", 429, responseBody);
      }
      if (res.status === 403 && errorCode === "not_connected") {
        throw new MdvApiError(
          "This property/listing has no granted co-host access at MyDataValue — connect it there before writing.",
          403,
          responseBody
        );
      }
      if (res.status === 403 && errorCode === "writes_disabled") {
        throw new MdvApiError("Writes are currently switched off for this MyDataValue team.", 403, responseBody);
      }
      throw new MdvApiError(`MyDataValue API error ${res.status} on ${method} ${path}`, res.status, responseBody);
    }
    return (await res.json()) as T;
  }

  // ---------- Reads ----------

  /** GET /booking/properties/ — whole portfolio in one call (not paginated), filtered to allowedAccountNames if set. */
  async listBookingProperties(): Promise<BookingProperty[]> {
    const data = await this.request<{ properties: Array<Record<string, unknown>> }>("GET", "/booking/properties/");
    const mapped = (data.properties ?? []).map(mapBookingProperty);
    if (this.allowedAccountNames.length === 0) return mapped;
    return mapped.filter((p) => p.accountName != null && this.allowedAccountNames.includes(p.accountName));
  }

  /** GET /airbnb/listings/ — paginated (limit/offset); pulls every page. No account_name field exists on this channel (see file header). */
  async listAirbnbListings(): Promise<AirbnbListing[]> {
    const out: AirbnbListing[] = [];
    let offset = 0;
    const limit = 200;
    for (;;) {
      const data = await this.request<{ count: number; results: Array<Record<string, unknown>> }>(
        "GET",
        `/airbnb/listings/?limit=${limit}&offset=${offset}`
      );
      const rows = data.results ?? [];
      out.push(...rows.map(mapAirbnbListing));
      offset += limit;
      if (offset >= (data.count ?? 0) || rows.length === 0) break;
    }
    return out;
  }

  /** GET /booking/pricing/{property_id}/ — per-room, per-date rate prices and availability. */
  async getBookingPricing(propertyId: number): Promise<BookingPricing> {
    const data = await this.request<Record<string, unknown>>("GET", `/booking/pricing/${propertyId}/`);
    return mapBookingPricing(data);
  }

  /** GET /booking/promotions/ — every promotion the team has recorded on Booking.com, active or not. READ-ONLY, see file header. */
  async listBookingPromotions(): Promise<BookingPromotion[]> {
    const data = await this.request<{ results: Array<Record<string, unknown>> }>("GET", "/booking/promotions/");
    return (data.results ?? []).map(mapBookingPromotion);
  }

  /** GET /airbnb/promotions/ — every promotion the team has recorded on Airbnb, active or not. READ-ONLY, see file header. */
  async listAirbnbPromotions(): Promise<AirbnbPromotion[]> {
    const data = await this.request<{ results: Array<Record<string, unknown>> }>("GET", "/airbnb/promotions/");
    return (data.results ?? []).map(mapAirbnbPromotion);
  }

  // ---------- Writes — the ONLY two write levers this API has (see file header) ----------

  /**
   * PUT /booking/auto-refresh/ — turns MDV's own nightly auto-push on/off
   * per Booking.com property. Does NOT set any specific price/promotion
   * value; it hands control to MDV's own engine.
   */
  async setBookingAutoRefresh(updates: Array<{ propertyId: number; enabled: boolean }>): Promise<void> {
    await this.request("PUT", "/booking/auto-refresh/", {
      updates: updates.map((u) => ({ property_id: u.propertyId, enabled: u.enabled })),
    });
  }

  /** PUT /airbnb/auto-refresh/ — same lever, for Airbnb listings. */
  async setAirbnbAutoRefresh(updates: Array<{ listingId: string; enabled: boolean }>): Promise<void> {
    await this.request("PUT", "/airbnb/auto-refresh/", {
      updates: updates.map((u) => ({ listing_id: u.listingId, enabled: u.enabled })),
    });
  }

  /**
   * PUT /booking/guest-target/ — sets the "Guest Target %" per Booking.com
   * property (Booking.com only; no Airbnb equivalent in this API). Feeds
   * MDV's own pricing/promotion engine; not a direct discount push. Pass
   * guestTargetPct: null to clear a property's target.
   */
  async setGuestTargetPct(updates: Array<{ propertyId: number; guestTargetPct: number | null }>): Promise<void> {
    await this.request("PUT", "/booking/guest-target/", {
      updates: updates.map((u) => ({ property_id: u.propertyId, guest_target_pct: u.guestTargetPct })),
    });
  }
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapBookingProperty(r: Record<string, unknown>): BookingProperty {
  return {
    propertyId: Number(r.property_id),
    name: (r.name as string) ?? null,
    city: (r.city as string) ?? null,
    accountName: (r.account_name as string) ?? null,
    guestTargetPct: numOrNull(r.guest_target_pct),
    commissionPct: numOrNull(r.commission_pct),
    status: String(r.status ?? "unknown"),
    extranetSynced: Boolean(r.extranet_synced),
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
  };
}

function mapAirbnbListing(r: Record<string, unknown>): AirbnbListing {
  return {
    listingId: String(r.listing_id),
    nickname: (r.nickname as string) ?? null,
    title: (r.title as string) ?? null,
    active: typeof r.active === "boolean" ? r.active : null,
    city: (r.city as string) ?? null,
    ratingAverage: numOrNull(r.rating_average),
    reviewCount: typeof r.review_count === "number" ? r.review_count : null,
  };
}

function mapBookingPromotion(r: Record<string, unknown>): BookingPromotion {
  return {
    propertyId: Number(r.property_id),
    id: String(r.id),
    name: (r.name as string) ?? null,
    promotionType: String(r.promotion_type ?? ""),
    discount: numOrNull(r.discount),
    isActive: Boolean(r.is_active),
  };
}

function mapAirbnbPromotion(r: Record<string, unknown>): AirbnbPromotion {
  return {
    listingId: String(r.listing_id),
    promotionId: String(r.promotion_id),
    promotionType: String(r.promotion_type ?? ""),
    priceFactor: numOrNull(r.price_factor),
    priceChange: numOrNull(r.price_change),
    startDate: (r.start_date as string) ?? null,
    endDate: (r.end_date as string) ?? null,
    minLengthOfStay: typeof r.min_length_of_stay === "number" ? r.min_length_of_stay : null,
    isActive: Boolean(r.is_active),
  };
}

function mapBookingPricing(data: Record<string, unknown>): BookingPricing {
  const rooms = Array.isArray(data.rooms)
    ? (data.rooms as Record<string, unknown>[]).map((r) => ({
        roomId: String(r.room_id),
        name: (r.name as string) ?? null,
      }))
    : [];
  const rates = Array.isArray(data.rates)
    ? (data.rates as Record<string, unknown>[]).map((r) => ({
        rateId: String(r.rate_id),
        roomId: String(r.room_id),
        name: (r.name as string) ?? null,
        dates: Array.isArray(r.dates)
          ? (r.dates as Record<string, unknown>[]).map((d) => ({
              date: String(d.date),
              prices: Array.isArray(d.prices)
                ? (d.prices as Record<string, unknown>[]).map((p) => ({
                    occupancy: typeof p.occupancy === "number" ? p.occupancy : null,
                    price: Number(p.price),
                  }))
                : [],
            }))
          : [],
      }))
    : [];
  return {
    rooms,
    rates,
    needsSync: Boolean(data.needs_sync),
    syncNote: String(data.sync_note ?? ""),
    dataAsOf: (data.data_as_of as string) ?? null,
  };
}
