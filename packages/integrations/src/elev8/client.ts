/**
 * Elev8 Suite "Partner API" client.
 *
 * STATUS (2026-08-07): CONFIRMED via Reto — base URL, auth scheme, and endpoints below
 * are real (docs: `partnerapiintegration.md`, Postman collection `Elevate_Service`).
 * Base URL: https://api.elev8-suite.com, path prefix /api/partner/v1, auth header
 * `X-Api-Key: <ELEV8_API_KEY>`.
 *
 * IMPORTANT SCOPE LIMIT: this Partner API only covers to-dos/tasks, listings (id + name +
 * address + coordinates), users, and roles — it does NOT expose revenue, occupancy,
 * ADR, reviews, or cleaning-cost data. Those are still only reachable through the
 * interactive `mcp__remote-devices__elev8-suite__*` MCP tools (proxied through the
 * user's own device bridge/session), which are NOT usable from an unattended Railway
 * worker. So this client unblocks: (a) a clean, stable Elev8 listing_id/name/address
 * source, and (b) turning Recommendation actions into real assigned to-dos for ops/
 * housekeeping staff (Phase 3 idea). It does NOT unblock the nightly KPI/occupancy sync
 * job — that still needs either Elev8 exposing analytics under this Partner API, or
 * another arrangement with Elev8 Suite engineering.
 *
 * The stored ELEV8_API_KEY was provided before this doc — its format doesn't obviously
 * match the documented "elv8_pk_..." prefix, so double check with the team that it is in
 * fact a Partner API key (generated via `POST /api/v1/partner/api-key`) and not some
 * other credential, before relying on it in production.
 */

export interface Elev8PartnerListing {
  id: string;
  name: string;
  internal_name: string | null;
  address: string | null;
  street: string | null;
  city: string | null;
  zip_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface Elev8PartnerTodo {
  id: string;
  external_ref: string | null;
  todo: string;
  status: 1 | 2 | 3;
  priority: 1 | 2 | 3;
  progress: number;
  image_urls: string[];
  listing_id: string;
  listing_name?: string;
  city?: string;
  address?: string;
  due_at: string | null;
  assigned_users?: { id: string; name: string }[];
  assigned_roles?: { id: string; name: string }[];
  created_at: string;
  updated_at: string;
}

export interface Elev8PartnerUser {
  id: string;
  name: string;
  email: string;
  role_id: string;
}

export interface Elev8PartnerRole {
  id: string;
  name: string;
  value: string;
}

interface Elev8Envelope<T> {
  status: "SUCCESS" | "FAILED";
  data: T;
  message?: string;
  total?: number;
  per_page?: number;
  current_page?: number;
  last_page?: number;
}

export interface UpsertTodoInput {
  listing_id: string;
  todo: string;
  external_ref?: string;
  priority?: 1 | 2 | 3;
  status?: 1 | 2 | 3;
  due_at?: string;
  image_urls?: string[];
  assign_to_users?: string[];
  assign_to_roles?: string[];
}

export class Elev8Client {
  constructor(
    private apiKey: string,
    private baseUrl: string = "https://api.elev8-suite.com"
  ) {
    if (!apiKey) {
      throw new Error("Elev8Client requires an API key (ELEV8_API_KEY).");
    }
  }

  private async request<T>(
    path: string,
    init: RequestInit & { query?: Record<string, string | undefined> } = {}
  ): Promise<T> {
    const { query, ...rest } = init;
    const url = new URL(`${this.baseUrl}/api/partner/v1${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") url.searchParams.set(key, value);
      }
    }
    const res = await fetch(url.toString(), {
      ...rest,
      headers: {
        "X-Api-Key": this.apiKey,
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...rest.headers,
      },
    });
    const body = (await res.json()) as Elev8Envelope<T>;
    if (!res.ok || body.status === "FAILED") {
      throw new Error(
        `Elev8 Partner API ${path} failed (${res.status}): ${body.message ?? "unknown error"}`
      );
    }
    return body.data;
  }

  /** GET /listings — all apartments for the tenant, with address + coordinates. */
  async listListings(): Promise<Elev8PartnerListing[]> {
    return this.request<Elev8PartnerListing[]>("/listings");
  }

  /** GET /todos — optionally filtered; pass a large per_page to get all in one page. */
  async listTodos(params: {
    listingId?: string;
    city?: string;
    status?: string; // CSV, e.g. "1,2"
    dueFrom?: string;
    dueTo?: string;
    page?: number;
    perPage?: number;
  } = {}): Promise<Elev8PartnerTodo[]> {
    return this.request<Elev8PartnerTodo[]>("/todos", {
      query: {
        listing_id: params.listingId,
        city: params.city,
        status: params.status,
        due_from: params.dueFrom,
        due_to: params.dueTo,
        page: params.page?.toString(),
        per_page: params.perPage?.toString(),
      },
    });
  }

  /**
   * POST /todos — idempotent upsert keyed on external_ref. Use this to turn an approved
   * Recommendation into a real, assigned to-do for ops/housekeeping staff.
   */
  async upsertTodo(input: UpsertTodoInput): Promise<Elev8PartnerTodo> {
    return this.request<Elev8PartnerTodo>("/todos", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /** PATCH /todos/:id — partial update; omitted fields are left unchanged. */
  async updateTodo(id: string, patch: Partial<UpsertTodoInput> & { progress?: number }): Promise<Elev8PartnerTodo> {
    return this.request<Elev8PartnerTodo>(`/todos/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  /** DELETE /todos/:id — soft-delete. */
  async deleteTodo(id: string): Promise<void> {
    await this.request<void>(`/todos/${id}`, { method: "DELETE" });
  }

  /** GET /users — assignable users, optionally filtered to one listing. */
  async listUsers(listingId?: string): Promise<Elev8PartnerUser[]> {
    return this.request<Elev8PartnerUser[]>("/users", { query: { listing_id: listingId } });
  }

  /** GET /roles — assignable roles. */
  async listRoles(): Promise<Elev8PartnerRole[]> {
    return this.request<Elev8PartnerRole[]>("/roles");
  }

  // --- NOT available via this Partner API — see class doc comment. Keep throwing so any
  // accidental caller finds out immediately instead of silently getting empty data. ---

  async listListingsOverview(): Promise<never> {
    throw new Error(
      "Not available via the Elev8 Partner API — use listListings() for id/name/address, " +
        "or the interactive elev8-suite MCP tools for revenue/occupancy analytics (not usable " +
        "from this unattended worker)."
    );
  }

  async getCleaningDurationDetail(_listingId: string): Promise<never> {
    throw new Error(
      "Not available via the Elev8 Partner API — cleaning duration/cost detail is only " +
        "reachable via the interactive elev8-suite MCP tools today."
    );
  }
}
