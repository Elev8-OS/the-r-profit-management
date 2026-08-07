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

  /** Single-turn text generation — no conversation state, no tool use. */
  async generateText(prompt: string, maxTokens = 600): Promise<string> {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // ignore
      }
      throw new AnthropicApiError(`Anthropic API error ${res.status}`, res.status, body);
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const textBlock = data.content?.find((b) => b.type === "text" && typeof b.text === "string");
    if (!textBlock?.text) {
      throw new AnthropicApiError("Anthropic response had no text content", 200, data);
    }
    return textBlock.text.trim();
  }
}
