import type { AIProvider, AIRequest, AIResponse, ProviderHealth } from "../types";
import { ProviderError } from "../types";
import { httpErrorToProviderError, networkErrorToProviderError } from "../http-errors";

/**
 * Minimal OpenAI Chat Completions adapter. Registered only when
 * OPENAI_API_KEY, OPENAI_MODEL and its prices are configured. Covered by
 * mocked-HTTP unit tests; not live-verified in this project.
 */
export interface OpenAIConfig {
  apiKey: string | undefined;
  liveMode: boolean;
  timeoutMs: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface ChatCompletion {
  model: string;
  choices: { message: { content: string | null }; finish_reason: string }[];
  usage?: { prompt_tokens: number; completion_tokens: number; completion_tokens_details?: { reasoning_tokens?: number } };
}

export class OpenAIProvider implements AIProvider {
  readonly id = "openai" as const;
  readonly kind = "cloud" as const;

  constructor(private readonly config: OpenAIConfig) {}

  get configured() {
    return Boolean(this.config.apiKey);
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.configured) return { providerId: "openai", status: "not_configured", detail: "OPENAI_API_KEY not set", checkedAt };
    if (!this.config.liveMode) return { providerId: "openai", status: "simulated", detail: "AI_LIVE_MODE=false; calls are simulated", checkedAt };
    return { providerId: "openai", status: "online", detail: "Live mode enabled · key configured", checkedAt };
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    if (process.env.VITEST && !this.config.fetchImpl) {
      throw new ProviderError("live_disabled", "Live API calls are blocked under the test runner", { scope: "provider", fallbackEligible: false });
    }
    if (!this.config.liveMode) throw new ProviderError("live_disabled", "AI_LIVE_MODE is false", { scope: "provider", fallbackEligible: true });
    if (!this.configured) throw new ProviderError("not_configured", "OPENAI_API_KEY is not set", { scope: "provider", fallbackEligible: true });

    const started = Date.now();
    const doFetch = this.config.fetchImpl ?? fetch;
    let res: Response;
    try {
      res = await doFetch(`${this.config.baseUrl ?? "https://api.openai.com"}/v1/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(request.timeoutMs ?? this.config.timeoutMs),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify({
          model: request.model,
          max_completion_tokens: request.maxOutputTokens,
          messages: [...(request.system ? [{ role: "system", content: request.system }] : []), { role: "user", content: request.prompt }],
        }),
      });
    } catch (err) {
      throw networkErrorToProviderError("OpenAI", err);
    }
    if (!res.ok) throw await httpErrorToProviderError("OpenAI", res);

    const data = (await res.json()) as ChatCompletion;
    const choice = data.choices[0];
    return {
      text: (choice?.message.content ?? "").trim(),
      model: data.model,
      providerId: "openai",
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
        source: data.usage ? "provider" : "estimated",
      },
      latencyMs: Date.now() - started,
      stopReason: choice?.finish_reason === "stop" ? "end" : choice?.finish_reason === "length" ? "max_tokens" : choice?.finish_reason === "content_filter" ? "refusal" : "other",
      simulated: false,
    };
  }
}
