/**
 * Shared domain types for the control plane.
 *
 * Everything in /core is pure TypeScript: no I/O, no framework imports, no
 * environment access. The services layer wires these pieces to providers,
 * storage and the clock.
 */

export type DataClassification = "public" | "internal" | "confidential" | "restricted";

export const CLASSIFICATIONS: readonly DataClassification[] = [
  "public",
  "internal",
  "confidential",
  "restricted",
] as const;

export type TaskType =
  | "summarization"
  | "extraction"
  | "classification"
  | "document_analysis"
  | "drafting"
  | "strategic_reasoning"
  | "coding"
  | "general";

export type Complexity = "low" | "medium" | "high" | "very_high";
export type BusinessRisk = "low" | "medium" | "high";

export type PriorityMode =
  | "lowest_cost"
  | "balanced"
  | "best_quality"
  | "fastest"
  | "privacy_first";

export type ProviderId = "ollama" | "anthropic" | "openai" | "google" | "mock";
export type ExecutionLocation = "local" | "cloud";

/** DEMO = simulated output, LOCAL = real on-device inference, LIVE = real paid API call. */
export type ExecutionMode = "demo" | "local" | "live";

export type Effort = "low" | "medium" | "high";

// ---------------------------------------------------------------------------
// Model registry
// ---------------------------------------------------------------------------

/**
 * Configurable Capability Profile (0–100 per dimension).
 *
 * These are routing configuration values, NOT independent benchmark scores.
 * They express how much an operator trusts a model for a kind of work and are
 * meant to be tuned (see the Model Comparison Lab).
 */
export interface CapabilityProfile {
  reasoning: number;
  creative: number;
  extraction: number;
  summarization: number;
  coding: number;
  classification: number;
}

export interface LatencyProfile {
  /** Network + queueing time before the first token (cloud) or request overhead (local). */
  overheadMs: number;
  prefillTokensPerSec: number;
  outputTokensPerSec: number;
  /** Extra time when a local model is not resident in memory. */
  coldStartMs: number;
  source: "configured" | "measured";
  samples: number;
}

export interface Pricing {
  inputPerMTok: number;
  outputPerMTok: number;
  /** Optional long-prompt tier (e.g. Haiku 5.5 above 100K input tokens). */
  longContext?: { thresholdTokens: number; inputPerMTok: number; outputPerMTok: number };
  source: string;
}

export type ModelTier = "local" | "economical" | "general" | "premium";

export interface ModelDescriptor {
  /** Registry id, e.g. "ollama:gemma4:12b-it-qat" or "anthropic:claude-sonnet-5-5". */
  id: string;
  providerId: Exclude<ProviderId, "mock">;
  /** Identifier passed to the provider API. */
  providerModelId: string;
  displayName: string;
  shortName: string;
  family: string;
  tier: ModelTier;
  location: ExecutionLocation;
  local: boolean;
  enabled: boolean;
  /** 0 for local models. Relative list-price index (Sonnet = 1). */
  relativeCost: number;
  capabilities: CapabilityProfile;
  capabilityBasis: string;
  /** Context the router may actually use (local: configured num_ctx). */
  contextWindowTokens: number;
  /** Model maximum, when it differs from the effective window. */
  maxContextTokens: number;
  maxOutputTokens: number;
  pricing: Pricing | null;
  latency: LatencyProfile;
  /** Highest classification this model is ever approved for (policy still applies). */
  privacyEligibility: DataClassification;
  externalDataTransfer: boolean;
  dataLocation: string;
  details?: {
    parameterSize?: string;
    quantization?: string;
    sizeBytes?: number;
    digest?: string;
    aliases?: string[];
    runtime?: string;
  };
}

// ---------------------------------------------------------------------------
// Task classification
// ---------------------------------------------------------------------------

export interface TaskInput {
  instruction: string;
  context?: string;
  declaredClassification?: DataClassification;
  taskTypeOverride?: TaskType;
  complexityOverride?: Complexity;
}

export type FindingKind =
  | "email"
  | "phone"
  | "payment_card"
  | "government_id"
  | "secret"
  | "marker"
  | "client_identifier"
  | "strategy"
  | "health"
  | "compensation";

export interface SensitivityFinding {
  kind: FindingKind;
  label: string;
  count: number;
  impliesAtLeast: DataClassification;
}

export interface TaskProfile {
  taskType: TaskType;
  taskTypeSource: "detected" | "override";
  taskTypeSignals: string[];
  complexity: Complexity;
  complexitySource: "detected" | "override";
  complexityScore: number;
  complexitySignals: string[];
  detectedClassification: DataClassification;
  declaredClassification?: DataClassification;
  classification: DataClassification;
  classificationReason: string;
  findings: SensitivityFinding[];
  businessRisk: BusinessRisk;
  riskSignals: string[];
  estimatedInputTokens: number;
  expectedOutputTokens: number;
  documentCount: number;
}

// ---------------------------------------------------------------------------
// Governance
// ---------------------------------------------------------------------------

export type CloudAccess = "allowed" | "approved_providers" | "explicit_permission" | "prohibited";

export interface ClassificationRule {
  classification: DataClassification;
  cloudAccess: CloudAccess;
  approvedProviders: ProviderId[];
  preferLocal: boolean;
  requireHumanReview: boolean;
}

export interface GovernancePolicy {
  version: number;
  rules: Record<DataClassification, ClassificationRule>;
  humanReview: {
    minEvaluationScore: number;
    onHighBusinessRisk: boolean;
    onQualityThresholdMiss: boolean;
    onFallback: boolean;
  };
}

export interface CloudPermission {
  granted: boolean;
  justification: string;
}

export type ReasonSeverity = "pass" | "info" | "warn" | "block";

export interface Reason {
  code: string;
  message: string;
  severity: ReasonSeverity;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export type Factor = "privacy" | "cost" | "taskFit" | "reasoning" | "latency";

export type FactorScores = Record<Factor, number>;

export type CandidateStatus =
  | "selected"
  | "eligible"
  | "below_threshold"
  | "blocked_policy"
  | "unavailable"
  | "over_budget"
  | "context_exceeded"
  | "disabled";

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  /** Expected external API cost in USD. */
  costUsd: number;
  /** Worst case at max_tokens; this is what the budget guard reserves. */
  maxCostUsd: number;
  maxOutputTokens: number;
  effort: Effort | null;
}

export interface LatencyEstimate {
  totalMs: number;
  coldStartMs: number;
  source: "configured" | "measured";
}

export interface CandidateEvaluation {
  modelId: string;
  displayName: string;
  shortName: string;
  providerId: ModelDescriptor["providerId"];
  location: ExecutionLocation;
  tier: ModelTier;
  status: CandidateStatus;
  reasons: Reason[];
  factors: FactorScores;
  quality: { score: number; required: number; meets: boolean };
  /** Weighted routing score (0–100); null when a hard gate removed the candidate. */
  routingScore: number | null;
  contributions: Record<Factor, number>;
  cost: CostEstimate;
  latency: LatencyEstimate;
  rank: number | null;
}

export interface ModeWeights {
  quality: number;
  cost: number;
  latency: number;
  privacy: number;
  /** Share of quality above the task requirement that still counts (diminishing returns). */
  headroom: number;
}

export interface BudgetGuardOutcome {
  triggered: boolean;
  originalModelId: string;
  reroutedToModelId: string | null;
  remainingUsd: number;
  requiredUsd: number;
  message: string;
}

export interface RoutingDecision {
  priorityMode: PriorityMode;
  /** Version of the governance policy that produced this decision. */
  policyVersion: number;
  weights: ModeWeights;
  profile: TaskProfile;
  rule: ClassificationRule;
  candidates: CandidateEvaluation[];
  selectedModelId: string | null;
  /** Ordered models execution may fall back to. Every entry already passed governance. */
  fallbackChain: string[];
  outcome: "routed" | "blocked";
  block: { code: string; message: string } | null;
  rationale: Reason[];
  budgetGuard: BudgetGuardOutcome | null;
  qualityThresholdMet: boolean;
  baseline: { modelId: string; costUsd: number };
  summary: {
    considered: number;
    eligible: number;
    blockedByPolicy: number;
    belowThreshold: number;
    unavailable: number;
  };
}

// ---------------------------------------------------------------------------
// Evaluation, review, trace
// ---------------------------------------------------------------------------

export interface EvaluationCheck {
  id: string;
  label: string;
  passed: boolean;
  weight: number;
  detail: string;
}

export interface EvaluationResult {
  score: number;
  method: "heuristic";
  checks: EvaluationCheck[];
}

export interface ReviewRequirement {
  required: boolean;
  reasons: Reason[];
}

export type TraceStage =
  | "request"
  | "classify"
  | "governance"
  | "availability"
  | "routing"
  | "budget"
  | "execution"
  | "fallback"
  | "evaluation"
  | "review"
  | "complete";

export type TraceLevel = "info" | "success" | "warn" | "block" | "error";

export interface TraceEvent {
  at: string;
  offsetMs: number;
  stage: TraceStage;
  level: TraceLevel;
  message: string;
  detail?: string;
  simulated?: boolean;
}

/** Fault injection for demo scenarios. Always recorded in the trace as SIMULATED. */
export interface SimulationOptions {
  ollamaOffline?: boolean;
  providerOutage?: ModelDescriptor["providerId"][];
  sessionSpendUsd?: number;
}
