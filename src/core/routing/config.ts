import type { CapabilityProfile, Complexity, DataClassification, ModeWeights, PriorityMode, TaskType } from "../types";

/**
 * Routing configuration. Every number the router uses lives here so the
 * decision is reproducible and explainable from one file.
 */

/** How a task type draws on the capability profile. Each row sums to 1. */
export const TASK_FIT_WEIGHTS: Record<TaskType, Partial<Record<keyof CapabilityProfile, number>>> = {
  summarization: { summarization: 0.7, extraction: 0.15, reasoning: 0.15 },
  extraction: { extraction: 0.8, classification: 0.1, reasoning: 0.1 },
  classification: { classification: 0.8, reasoning: 0.2 },
  document_analysis: { extraction: 0.35, summarization: 0.35, reasoning: 0.3 },
  drafting: { creative: 0.6, summarization: 0.2, reasoning: 0.2 },
  strategic_reasoning: { reasoning: 0.6, creative: 0.2, summarization: 0.2 },
  coding: { coding: 0.8, reasoning: 0.2 },
  general: { reasoning: 0.3, creative: 0.3, summarization: 0.2, extraction: 0.2 },
};

/** Share of the quality score carried by the reasoning profile, by complexity. */
export const REASONING_SHARE: Record<Complexity, number> = { low: 0.15, medium: 0.3, high: 0.5, very_high: 0.65 };

/** Minimum quality a candidate must reach to be selected without a threshold warning. */
export const REQUIRED_QUALITY: Record<Complexity, number> = { low: 60, medium: 68, high: 78, very_high: 85 };

/**
 * Privacy factor for cloud execution, by classification. Local is always 100.
 * Public data loses little by leaving the device; internal and confidential lose more.
 */
export const CLOUD_PRIVACY_SCORE: Record<DataClassification, number> = {
  public: 85,
  internal: 55,
  confidential: 25,
  restricted: 0,
};

/** Cost factor: 100 at $0, 0 at or above this per-request cost (square-root scale). */
export const COST_REFERENCE_USD = 0.05;

/** Scores within this band are tied; the cheaper candidate wins, then the faster one. */
export const TIE_BAND = 0.5;

export const MODE_WEIGHTS: Record<PriorityMode, ModeWeights> = {
  balanced: { quality: 0.4, cost: 0.25, latency: 0.15, privacy: 0.2, headroom: 0.35 },
  lowest_cost: { quality: 0.2, cost: 0.7, latency: 0, privacy: 0.1, headroom: 0.2 },
  best_quality: { quality: 0.75, cost: 0.05, latency: 0.1, privacy: 0.1, headroom: 1 },
  fastest: { quality: 0.2, cost: 0.1, latency: 0.6, privacy: 0.1, headroom: 0.2 },
  privacy_first: { quality: 0.25, cost: 0.1, latency: 0.05, privacy: 0.6, headroom: 0.35 },
};

export const PRIORITY_LABEL: Record<PriorityMode, string> = {
  lowest_cost: "Lowest cost",
  balanced: "Balanced",
  best_quality: "Best quality",
  fastest: "Fastest",
  privacy_first: "Privacy first",
};

export const PRIORITY_DESCRIPTION: Record<PriorityMode, string> = {
  lowest_cost: "Minimize external API spend among models that clear the quality threshold.",
  balanced: "Weigh quality, cost, latency and privacy. Surplus quality above the requirement counts at 35%.",
  best_quality: "Maximize expected quality. Cost still breaks near-ties.",
  fastest: "Minimize expected time to a complete answer.",
  privacy_first: "Keep data on the device whenever a local model clears the threshold.",
};
