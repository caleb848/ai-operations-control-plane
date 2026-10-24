import type { Effort, ProviderId } from "@/core/types";

export interface AIRequest {
  /** Provider-native model id (e.g. "gemma4:12b-it-qat", "claude-sonnet-5-5"). */
  model: string;
  system?: string;
  prompt: string;
  maxOutputTokens: number;
  effort?: Effort | null;
  timeoutMs?: number;
  /** Hints for the simulated provider; ignored by real providers. */
  simulation?: { scenarioId?: string; taskType?: string; registryModelId?: string; latencyMs?: number };
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  /** "provider" = counts reported by the API; "estimated" = our estimate (simulated runs). */
  source: "provider" | "estimated";
}

export interface AIResponse {
  text: string;
  model: string;
  providerId: ProviderId;
  usage: AIUsage;
  latencyMs: number;
  timings?: {
    loadMs?: number;
    promptEvalMs?: number;
    evalMs?: number;
    promptTokensPerSec?: number;
    outputTokensPerSec?: number;
  };
  stopReason: "end" | "max_tokens" | "refusal" | "other";
  /** True only for MockProvider output. The UI never renders simulated text as model output. */
  simulated: boolean;
  /** Simulated execution replaying text a real local model produced for this exact prompt. */
  recorded?: { model: string; modelName: string; recordedAt: string; latencyMs: number; machine: string };
}

export type ProviderErrorCode =
  | "unavailable"
  | "timeout"
  | "rate_limited"
  | "overloaded"
  | "auth"
  | "bad_request"
  | "not_configured"
  | "live_disabled"
  | "budget"
  | "unknown";

/**
 * Normalized provider failure. `scope` tells the executor whether to skip just
 * this model or every model from the provider; `fallbackEligible` is false for
 * request errors that would fail identically elsewhere.
 */
export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly opts: {
      scope: "provider" | "model";
      fallbackEligible: boolean;
      status?: number;
      simulated?: boolean;
      /** Refused before any network call (live mode off, budget, not configured); doesn't use an attempt. */
      preflight?: boolean;
    },
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface ProviderHealth {
  providerId: ProviderId;
  status: "online" | "offline" | "not_configured" | "simulated";
  detail: string;
  version?: string;
  latencyMs?: number;
  checkedAt: string;
}

export interface AIProvider {
  readonly id: ProviderId;
  readonly kind: "local" | "cloud" | "simulated";
  execute(request: AIRequest): Promise<AIResponse>;
  health(): Promise<ProviderHealth>;
}
