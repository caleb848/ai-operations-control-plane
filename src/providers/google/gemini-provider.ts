import type { AIProvider, AIRequest, AIResponse, ProviderHealth } from "../types";
import { ProviderError } from "../types";
import { httpErrorToProviderError, networkErrorToProviderError } from "../http-errors";

/**
 * Minimal Gemini generateContent adapter. Registered only when
 * GEMINI_API_KEY, GEMINI_MODEL and its prices are configured. Covered by
 * mocked-HTTP unit tests; not live-verified in this project.
 */
export interface GeminiConfig {
  apiKey: string | undefined;
  liveMode: boolean;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

interface GenerateContentResponse {
  modelVersion?: string;
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
}

export class GeminiProvider implements AIProvider {
  readonly id = "google" as const;
  readonly kind = "cloud" as const;

  constructor(private readonly config: GeminiConfig) {}

  get configured() {
    return Boolean(this.config.apiKey);
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.configured) return { providerId: "google", status: "not_configured", detail: "GEMINI_API_KEY not set", checkedAt };
    if (!this.config.liveMode) return { providerId: "google", status: "simulated", detail: "AI_LIVE_MODE=false; calls are simulated", checkedAt };
    return { providerId: "google", status: "online", detail: "Live mode enabled · key configured", checkedAt };
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    if (process.env.VITEST && !this.config.fetchImpl) {
      throw new ProviderError("live_disabled", "Live API calls are blocked under the test runner", { scope: "provider", fallbackEligible: false });
    }
    if (!this.config.liveMode) throw new ProviderError("live_disabled", "AI_LIVE_MODE is false", { scope: "provider", fallbackEligible: true });
    if (!this.configured) throw new ProviderError("not_configured", "GEMINI_API_KEY is not set", { scope: "provider", fallbackEligible: true });

    const started = Date.now();
    const doFetch = this.config.fetchImpl ?? fetch;
    let res: Response;
    try {
      res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(request.timeoutMs ?? this.config.timeoutMs),
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.config.apiKey ?? "" },
        body: JSON.stringify({
          ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
          contents: [{ role: "user", parts: [{ text: request.prompt }] }],
          generationConfig: { maxOutputTokens: request.maxOutputTokens },
        }),
      });
    } catch (err) {
      throw networkErrorToProviderError("Gemini", err);
    }
    if (!res.ok) throw await httpErrorToProviderError("Gemini", res);

    const data = (await res.json()) as GenerateContentResponse;
    const cand = data.candidates?.[0];
    const finish = cand?.finishReason;
    return {
      text: (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim(),
      model: data.modelVersion ?? request.model,
      providerId: "google",
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: (data.usageMetadata?.candidatesTokenCount ?? 0) + (data.usageMetadata?.thoughtsTokenCount ?? 0),
        reasoningTokens: data.usageMetadata?.thoughtsTokenCount ?? 0,
        source: data.usageMetadata ? "provider" : "estimated",
      },
      latencyMs: Date.now() - started,
      stopReason: finish === "STOP" ? "end" : finish === "MAX_TOKENS" ? "max_tokens" : finish === "SAFETY" ? "refusal" : "other",
      simulated: false,
    };
  }
}
