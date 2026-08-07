/**
 * Minimal Anthropic Messages API client — used only by the AI_SUGGESTION
 * recommendation generator (apps/web listings actions). Plain fetch, no SDK
 * dependency, matching this codebase's style for the other typed REST
 * clients (PriceLabsClient, MdvClient).
 *
 * Requires ANTHROPIC_API_KEY (a real Anthropic API key from
 * console.anthropic.com — separate from this app's own Claude-branded UI,
 * this is a server-side credential). Never logged, never committed — set
 * directly as a Railway env var, same rule as every other API key in this
 * project.
 */

export class AnthropicApiError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
    this.name = "AnthropicApiError";
  }
}

export interface GenerateTextOptions {
  /** Optional system prompt — sets persona/role/output-format instructions separately from the user message. */
  system?: string;
  maxTokens?: number;
  /**
   * Enables Anthropic's server-side web search tool (web_search_20250305).
   * Claude decides when to search and the search runs server-side within the
   * same request — no client-side tool loop needed. Each search has its own
   * cost on top of normal token usage; keep maxWebSearches conservative.
   */
  enableWebSearch?: boolean;
  maxWebSearches?: number;
}

export class AnthropicClient {
  constructor(
    private apiKey: string,
    private model = "claude-sonnet-4-5-20250929",
    private baseUrl = "https://api.anthropic.com"
  ) {
    if (!apiKey) {
      throw new Error("AnthropicClient requires an API key (set ANTHROPIC_API_KEY)");
    }
  }

  /**
   * Single-turn text generation. No client-side conversation state is kept —
   * when enableWebSearch is set, Claude's server-side web search tool still
   * runs entirely within this one HTTP call (Anthropic executes the searches
   * and feeds results back to the model before returning), so no tool-use
   * loop needs to be implemented here.
   */
  async generateText(prompt: string, opts: GenerateTextOptions = {}): Promise<string> {
    const { system, maxTokens = 600, enableWebSearch = false, maxWebSearches = 5 } = opts;

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    };
    if (system) body.system = system;
    if (enableWebSearch) {
      body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: maxWebSearches }];
    }

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let responseBody: unknown = null;
      try {
        responseBody = await res.json();
      } catch {
        // ignore
      }
      throw new AnthropicApiError(`Anthropic API error ${res.status}`, res.status, responseBody);
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    // With web search enabled, content can interleave server_tool_use /
    // web_search_tool_result blocks with one or more text blocks. Join every
    // text block in order rather than assuming exactly one.
    const textBlocks = (data.content ?? [])
      .filter((b): b is { type: string; text: string } => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text.trim())
      .filter(Boolean);
    if (textBlocks.length === 0) {
      throw new AnthropicApiError("Anthropic response had no text content", 200, data);
    }
    return textBlocks.join("\n\n").trim();
  }

  /**
   * Structured-output generation via a forced tool call. Anthropic has no
   * "response_format: json_schema" mode (unlike some other vendors) — the
   * reliable way to get schema-shaped JSON back is to define one tool whose
   * input_schema IS the desired shape, then force tool_choice to that tool.
   * The model's entire "response" becomes that one tool_use block's `input`,
   * which is already parsed JSON (no string-parsing/repair needed).
   *
   * Deliberately does NOT accept enableWebSearch: forcing tool_choice to a
   * specific custom tool makes the model call it immediately, so it cannot
   * also decide to run a web search first in the same request. Callers that
   * need both research and structured output should do a first free-form
   * generateText() call with web search enabled, then feed that result into
   * a second generateJson() call (no search tool) to structure it — see
   * generateAiSuggestion in apps/web for this two-step pattern.
   */
  async generateJson<T = unknown>(
    prompt: string,
    schema: Record<string, unknown>,
    opts: { system?: string; maxTokens?: number; toolName?: string; toolDescription?: string } = {}
  ): Promise<T> {
    const { system, maxTokens = 1500, toolName = "emit_structured_output", toolDescription = "Emit the result in the required structured shape." } = opts;

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
      tools: [{ name: toolName, description: toolDescription, input_schema: schema }],
      tool_choice: { type: "tool", name: toolName },
    };
    if (system) body.system = system;

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let responseBody: unknown = null;
      try {
        responseBody = await res.json();
      } catch {
        // ignore
      }
      throw new AnthropicApiError(`Anthropic API error ${res.status}`, res.status, responseBody);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; input?: unknown; name?: string }>;
    };
    const toolUse = (data.content ?? []).find((b) => b.type === "tool_use" && b.name === toolName);
    if (!toolUse || typeof toolUse.input === "undefined") {
      throw new AnthropicApiError("Anthropic response had no tool_use block for the forced tool", 200, data);
    }
    return toolUse.input as T;
  }
}
