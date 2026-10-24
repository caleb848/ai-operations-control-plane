import { z } from "zod";

const classification = z.enum(["public", "internal", "confidential", "restricted"]);
const priority = z.enum(["lowest_cost", "balanced", "best_quality", "fastest", "privacy_first"]);
const taskType = z.enum(["summarization", "extraction", "classification", "document_analysis", "drafting", "strategic_reasoning", "coding", "general"]);
const complexity = z.enum(["low", "medium", "high", "very_high"]);

/** Inputs are bounded: the local context window is 32K tokens, and nothing here should be unbounded. */
export const taskRequestSchema = z.object({
  instruction: z.string().trim().min(3, "Describe the task").max(8000),
  context: z.string().max(120_000).optional().default(""),
  declaredClassification: classification.optional(),
  taskTypeOverride: taskType.optional(),
  complexityOverride: complexity.optional(),
  priorityMode: priority.default("balanced"),
  scenarioId: z.string().max(64).optional(),
  permission: z
    .object({ granted: z.boolean(), justification: z.string().max(500) })
    .strict()
    .optional(),
  simulation: z
    .object({
      ollamaOffline: z.boolean().optional(),
      providerOutage: z.array(z.enum(["anthropic", "openai", "google"])).max(3).optional(),
      sessionSpendUsd: z.number().min(0).max(1000).optional(),
    })
    .strict()
    .optional(),
  pinModelId: z.string().max(200).optional(),
  allowLive: z.boolean().optional(),
  maxLiveCostUsd: z.number().min(0).max(10).optional(),
  source: z.enum(["console", "scenario", "compare", "api"]).optional(),
}).strict();

export type TaskRequestBody = z.infer<typeof taskRequestSchema>;

export const approvalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(1000).optional().default(""),
  reviewer: z.string().trim().max(80).optional(),
});

const rule = z.object({
  classification,
  cloudAccess: z.enum(["allowed", "approved_providers", "explicit_permission", "prohibited"]),
  approvedProviders: z.array(z.enum(["ollama", "anthropic", "openai", "google", "mock"])),
  preferLocal: z.boolean(),
  requireHumanReview: z.boolean(),
});

export const policySchema = z.object({
  version: z.number(),
  rules: z.object({ public: rule, internal: rule, confidential: rule, restricted: rule }),
  humanReview: z.object({
    minEvaluationScore: z.number().min(0).max(100),
    onHighBusinessRisk: z.boolean(),
    onQualityThresholdMiss: z.boolean(),
    onFallback: z.boolean(),
  }),
});

const score = z.number().int().min(0).max(100);
export const modelOverrideSchema = z.object({
  enabled: z.boolean().optional(),
  capabilities: z
    .object({ reasoning: score, creative: score, extraction: score, summarization: score, coding: score, classification: score })
    .partial()
    .optional(),
});

export function badRequest(error: z.ZodError) {
  return Response.json({ error: "Invalid request", issues: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
}
