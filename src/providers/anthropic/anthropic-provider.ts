import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, AIRequest, AIResponse, ProviderHealth } from "../types";
import { ProviderError } from "../types";

/**
 * Anthropic adapter (official SDK).
 *
 * Budget-safety choices:
 *  - maxRetries: 0. The control plane owns retries and fallback, and records
 *    each attempt; the SDK's silent retries would double-spend.
 *  - max_tokens always comes from the router's capped estimate.
 *  - effort is set explicitly (Opus 5.5 and Haiku 5.5 default to medium).
 *  - No server-side `fallbacks`: a silent server-side model swap would bypass
 *    governance and cost accounting. Refusals are surfaced and recorded.
 *  - Refuses to run under the test runner.
 */

export interface AnthropicConfig {
  apiKey: string | undefined;
  liveMode: boolean;
  timeoutMs: number;
}

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic" as const;
  readonly kind = "cloud" as const;
  private client: Anthropic | null = null;

  constructor(private readonly config: AnthropicConfig) {}

  get configured(): boolean {
    return Boolean(this.config.apiKey);
  }

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({ apiKey: this.config.apiKey, maxRetries: 0, timeout: this.config.timeoutMs });
    }
    return this.client;
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.configured) return { providerId: "anthropic", status: "not_configured", detail: "ANTHROPIC_API_KEY not set", checkedAt };
    if (!this.config.liveMode) {
      return { providerId: "anthropic", status: "simulated", detail: "Key configured; AI_LIVE_MODE=false, so cloud calls are simulated", checkedAt };
    }
    // No network call: a health probe would itself be a request against the account.
    return { providerId: "anthropic", status: "online", detail: "Live mode enabled · key configured", checkedAt };
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    if (process.env.VITEST && process.env.ALLOW_LIVE_API_IN_TESTS !== "true") {
      throw new ProviderError("live_disabled", "Live API calls are blocked under the test runner", { scope: "provider", fallbackEligible: false });
    }
    if (!this.config.liveMode) {
      throw new ProviderError("live_disabled", "AI_LIVE_MODE is false; paid API calls are disabled", { scope: "provider", fallbackEligible: true });
    }
    if (!this.configured) {
      throw new ProviderError("not_configured", "ANTHROPIC_API_KEY is not set", { scope: "provider", fallbackEligible: true });
    }

    const started = Date.now();
    try {
      const response = await this.getClient().messages.create({
        model: request.model,
        max_tokens: request.maxOutputTokens,
        ...(request.system ? { system: request.system } : {}),
        ...(request.effort ? { output_config: { effort: request.effort } } : {}),
        messages: [{ role: "user", content: request.prompt }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      return {
        text,
        model: response.model,
        providerId: "anthropic",
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          reasoningTokens: response.usage.output_tokens_details?.thinking_tokens ?? 0,
          source: "provider",
        },
        latencyMs: Date.now() - started,
        stopReason:
          response.stop_reason === "end_turn"
            ? "end"
            : response.stop_reason === "max_tokens"
              ? "max_tokens"
              : response.stop_reason === "refusal"
                ? "refusal"
                : "other",
        simulated: false,
      };
    } catch (err) {
      throw normalizeAnthropicError(err);
    }
  }
}

export function normalizeAnthropicError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError("auth", "Anthropic rejected the API key", { scope: "provider", fallbackEligible: true, status: err.status });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ProviderError("rate_limited", "Anthropic rate limit reached", { scope: "provider", fallbackEligible: true, status: 429 });
  }
  if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError || err instanceof Anthropic.UnprocessableEntityError) {
    return new ProviderError("bad_request", `Anthropic rejected the request: ${err.message.slice(0, 200)}`, {
      scope: "model",
      fallbackEligible: false,
      status: err.status,
    });
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new ProviderError("timeout", "Anthropic request timed out", { scope: "provider", fallbackEligible: true });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ProviderError("unavailable", "Could not reach the Anthropic API", { scope: "provider", fallbackEligible: true });
  }
  if (err instanceof Anthropic.APIError) {
    const overloaded = err.status === 529;
    return new ProviderError(overloaded ? "overloaded" : "unavailable", `Anthropic API error ${err.status ?? ""}`.trim(), {
      scope: overloaded ? "model" : "provider",
      fallbackEligible: true,
      status: err.status,
    });
  }
  return new ProviderError("unknown", err instanceof Error ? err.message : "Unknown Anthropic error", { scope: "provider", fallbackEligible: true });
}
