import type {
  BusinessRisk,
  Complexity,
  DataClassification,
  EvaluationResult,
  ExecutionLocation,
  ExecutionMode,
  PriorityMode,
  ProviderId,
  ReviewRequirement,
  RoutingDecision,
  TaskType,
  TraceEvent,
} from "@/core/types";

export type ExecutionSource = "console" | "scenario" | "compare" | "seed" | "api";
export type ExecutionStatus = "completed" | "blocked" | "failed";
export type ReviewStatus = "not_required" | "pending" | "approved" | "rejected";

export interface AttemptRecord {
  modelId: string;
  providerId: ProviderId;
  mode: ExecutionMode;
  ok: boolean;
  latencyMs: number;
  error?: { code: string; message: string; simulated: boolean };
}

export interface ExecutionRecord {
  id: string;
  createdAt: string;
  source: ExecutionSource;
  scenarioId: string | null;
  sessionId: string | null;
  status: ExecutionStatus;
  mode: ExecutionMode | null;
  location: ExecutionLocation | null;
  taskType: TaskType;
  complexity: Complexity;
  classification: DataClassification;
  businessRisk: BusinessRisk;
  priorityMode: PriorityMode;
  selectedModelId: string | null;
  executedModelId: string | null;
  executedProvider: ProviderId | null;
  fallbackUsed: boolean;
  budgetGuard: boolean;
  policyBlocks: number;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  tokenSource: "provider" | "estimated" | null;
  externalCostUsd: number;
  simulatedCostUsd: number;
  estimatedCostUsd: number;
  baselineCostUsd: number;
  latencyMs: number | null;
  /** measured = this run; recorded = a real run on the developer's machine, replayed; estimated = router estimate. */
  latencySource: "measured" | "recorded" | "estimated" | null;
  outputTps: number | null;
  prefillTps: number | null;
  loadMs: number | null;
  evalScore: number | null;
  reviewRequired: boolean;
  reviewStatus: ReviewStatus;
  title: string;
  inputPreview: string;
  inputSha256: string;
  outputText: string | null;
  error: string | null;
  decision: RoutingDecision;
  evaluation: EvaluationResult | null;
  review: ReviewRequirement | null;
  attempts: AttemptRecord[];
  trace: TraceEvent[];
}

export type ExecutionSummary = Omit<ExecutionRecord, "decision" | "evaluation" | "review" | "trace" | "attempts" | "outputText"> & {
  executedModelName: string | null;
  selectedModelName: string | null;
};
