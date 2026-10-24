import type { Complexity, CostEstimate, Effort, ModelDescriptor, Pricing, TaskProfile } from "../types";

/** External API cost for a token count at list price. Local models have no pricing and cost $0. */
export function apiCost(pricing: Pricing | null, inputTokens: number, outputTokens: number): number {
  if (!pricing) return 0;
  const long = pricing.longContext && inputTokens > pricing.longContext.thresholdTokens ? pricing.longContext : null;
  const inRate = long ? long.inputPerMTok : pricing.inputPerMTok;
  const outRate = long ? long.outputPerMTok : pricing.outputPerMTok;
  return (inputTokens * inRate + outputTokens * outRate) / 1_000_000;
}

/** Effort requested from cloud reasoning models, by task complexity. Lower effort = fewer reasoning tokens. */
export const EFFORT_BY_COMPLEXITY: Record<Complexity, Effort> = {
  low: "low",
  medium: "low",
  high: "medium",
  very_high: "high",
};

/**
 * Expected reasoning tokens as a multiple of visible output. Thinking tokens
 * are billed as output tokens. Local models run with thinking disabled.
 */
export const REASONING_OVERHEAD: Record<Effort, number> = { low: 0.15, medium: 0.5, high: 1.0 };

export interface CostLimits {
  /** Hard cap on max_tokens for live cloud calls. */
  liveMaxOutputTokens: number;
  /** Cap on generated tokens for local calls (bounds latency, not money). */
  localMaxOutputTokens: number;
}

export const DEFAULT_COST_LIMITS: CostLimits = { liveMaxOutputTokens: 4000, localMaxOutputTokens: 900 };

export function estimateCost(model: ModelDescriptor, profile: TaskProfile, limits: CostLimits = DEFAULT_COST_LIMITS): CostEstimate {
  const inputTokens = profile.estimatedInputTokens;
  const visible = profile.expectedOutputTokens;

  if (model.local) {
    const maxOutputTokens = Math.min(limits.localMaxOutputTokens, model.maxOutputTokens, Math.max(256, visible * 2));
    return {
      inputTokens,
      outputTokens: Math.min(visible, maxOutputTokens),
      reasoningTokens: 0,
      costUsd: 0,
      maxCostUsd: 0,
      maxOutputTokens,
      effort: null,
    };
  }

  const effort = EFFORT_BY_COMPLEXITY[profile.complexity];
  const reasoningTokens = Math.round(visible * REASONING_OVERHEAD[effort]);
  // Headroom so adaptive thinking plus the answer fits, bounded by the live cap.
  const maxOutputTokens = Math.min(
    limits.liveMaxOutputTokens,
    model.maxOutputTokens,
    Math.max(512, Math.ceil((visible + reasoningTokens) * 1.5)),
  );
  const outputTokens = Math.min(visible + reasoningTokens, maxOutputTokens);
  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    costUsd: apiCost(model.pricing, inputTokens, outputTokens),
    maxCostUsd: apiCost(model.pricing, inputTokens, maxOutputTokens),
    maxOutputTokens,
    effort,
  };
}

export function formatUsd(usd: number, opts: { precise?: boolean } = {}): string {
  if (usd === 0) return "$0.00";
  const abs = Math.abs(usd);
  if (abs < 0.0001) return `${usd < 0 ? "-" : ""}<$0.0001`;
  if (abs < 0.01 || opts.precise) return `${usd < 0 ? "-" : ""}$${abs.toFixed(abs < 0.001 ? 5 : 4)}`;
  if (abs < 100) return `${usd < 0 ? "-" : ""}$${abs.toFixed(2)}`;
  return `${usd < 0 ? "-" : ""}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
