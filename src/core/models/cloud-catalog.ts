import type { CapabilityProfile, ModelDescriptor } from "../types";

/**
 * Cloud model catalog. Prices are Anthropic first-party list prices per
 * million tokens (Claude API reference, cached 2026-10-06). Latency figures
 * are configured estimates until live executions replace them with
 * measurements. Capability values are Configurable Capability Profiles.
 */

const ANTHROPIC_PRICE_SOURCE = "Anthropic list price (Claude API reference, cached 2026-10-06)";

export const ANTHROPIC_MODELS: ModelDescriptor[] = [
  {
    id: "anthropic:claude-haiku-5-5",
    providerId: "anthropic",
    providerModelId: "claude-haiku-5-5",
    displayName: "Claude Haiku 5.5",
    shortName: "Haiku 5.5",
    family: "claude-haiku",
    tier: "economical",
    location: "cloud",
    local: false,
    enabled: true,
    relativeCost: 0.05,
    capabilities: { reasoning: 76, creative: 80, extraction: 89, summarization: 87, coding: 82, classification: 89 },
    capabilityBasis: "Economical-tier default. Routing configuration, not a benchmark.",
    contextWindowTokens: 1_000_000,
    maxContextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    pricing: {
      inputPerMTok: 0.1,
      outputPerMTok: 0.5,
      longContext: { thresholdTokens: 100_000, inputPerMTok: 0.5, outputPerMTok: 2.5 },
      source: ANTHROPIC_PRICE_SOURCE,
    },
    latency: { overheadMs: 600, prefillTokensPerSec: 6000, outputTokensPerSec: 150, coldStartMs: 0, source: "configured", samples: 0 },
    privacyEligibility: "confidential",
    externalDataTransfer: true,
    dataLocation: "Anthropic API · cloud",
  },
  {
    id: "anthropic:claude-sonnet-5-5",
    providerId: "anthropic",
    providerModelId: "claude-sonnet-5-5",
    displayName: "Claude Sonnet 5.5",
    shortName: "Sonnet 5.5",
    family: "claude-sonnet",
    tier: "general",
    location: "cloud",
    local: false,
    enabled: true,
    relativeCost: 1,
    capabilities: { reasoning: 91, creative: 90, extraction: 94, summarization: 93, coding: 94, classification: 93 },
    capabilityBasis: "General high-quality tier default. Routing configuration, not a benchmark.",
    contextWindowTokens: 1_000_000,
    maxContextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    pricing: { inputPerMTok: 2, outputPerMTok: 10, source: ANTHROPIC_PRICE_SOURCE },
    latency: { overheadMs: 1000, prefillTokensPerSec: 5000, outputTokensPerSec: 80, coldStartMs: 0, source: "configured", samples: 0 },
    privacyEligibility: "confidential",
    externalDataTransfer: true,
    dataLocation: "Anthropic API · cloud",
  },
  {
    id: "anthropic:claude-opus-5-5",
    providerId: "anthropic",
    providerModelId: "claude-opus-5-5",
    displayName: "Claude Opus 5.5",
    shortName: "Opus 5.5",
    family: "claude-opus",
    tier: "premium",
    location: "cloud",
    local: false,
    enabled: true,
    relativeCost: 2,
    capabilities: { reasoning: 97, creative: 94, extraction: 95, summarization: 95, coding: 97, classification: 94 },
    capabilityBasis: "Premium reasoning tier default. Routing configuration, not a benchmark.",
    contextWindowTokens: 1_000_000,
    maxContextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    pricing: { inputPerMTok: 4, outputPerMTok: 20, source: ANTHROPIC_PRICE_SOURCE },
    latency: { overheadMs: 1500, prefillTokensPerSec: 4000, outputTokensPerSec: 50, coldStartMs: 0, source: "configured", samples: 0 },
    privacyEligibility: "confidential",
    externalDataTransfer: true,
    dataLocation: "Anthropic API · cloud",
  },
];

/** Baseline for "spend avoided": what the request would cost if every task went to this model. */
export const BASELINE_MODEL_ID = "anthropic:claude-sonnet-5-5";

const GENERIC_GENERAL_PROFILE: CapabilityProfile = {
  reasoning: 88,
  creative: 88,
  extraction: 92,
  summarization: 91,
  coding: 90,
  classification: 91,
};

export interface ConfiguredCloudModel {
  providerId: "openai" | "google";
  modelId: string;
  inputPerMTok: number;
  outputPerMTok: number;
}

/**
 * OpenAI / Gemini entries exist only when the operator configures a model id
 * and its prices; the app ships no guessed prices for them.
 */
export function configuredCloudModel(cfg: ConfiguredCloudModel): ModelDescriptor {
  const vendor = cfg.providerId === "openai" ? "OpenAI" : "Google Gemini";
  return {
    id: `${cfg.providerId}:${cfg.modelId}`,
    providerId: cfg.providerId,
    providerModelId: cfg.modelId,
    displayName: `${vendor} · ${cfg.modelId}`,
    shortName: cfg.modelId,
    family: cfg.providerId,
    tier: "general",
    location: "cloud",
    local: false,
    enabled: true,
    relativeCost: Number((cfg.outputPerMTok / 10).toFixed(2)),
    capabilities: GENERIC_GENERAL_PROFILE,
    capabilityBasis: "Generic general-tier default for an operator-configured model. Tune before relying on it.",
    contextWindowTokens: 128_000,
    maxContextTokens: 128_000,
    maxOutputTokens: 16_000,
    pricing: { inputPerMTok: cfg.inputPerMTok, outputPerMTok: cfg.outputPerMTok, source: "Operator-configured price (env)" },
    latency: { overheadMs: 1000, prefillTokensPerSec: 5000, outputTokensPerSec: 80, coldStartMs: 0, source: "configured", samples: 0 },
    privacyEligibility: "internal",
    externalDataTransfer: true,
    dataLocation: `${vendor} API · cloud`,
  };
}
