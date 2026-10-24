import { CLASSIFICATION_LABEL } from "../security/classification";
import type { EvaluationResult, GovernancePolicy, Reason, ReviewRequirement, TaskProfile } from "../types";

export interface ReviewContext {
  profile: TaskProfile;
  policy: GovernancePolicy;
  evaluation: EvaluationResult | null;
  qualityThresholdMet: boolean;
  fallbackUsed: boolean;
  cloudPermissionUsed: boolean;
}

/** Human-in-the-loop rules. Each rule that fires becomes a visible reason on the approval item. */
export function reviewRequirement(ctx: ReviewContext): ReviewRequirement {
  const { profile, policy, evaluation } = ctx;
  const reasons: Reason[] = [];
  const rule = policy.rules[profile.classification];

  if (rule.requireHumanReview) {
    reasons.push({
      code: "classification",
      severity: "warn",
      message: `${CLASSIFICATION_LABEL[profile.classification]} data: policy requires human review before use`,
    });
  }
  if (ctx.cloudPermissionUsed) {
    reasons.push({ code: "cloud_permission", severity: "warn", message: "Sent to a cloud provider under an explicit policy exception" });
  }
  if (evaluation && evaluation.score < policy.humanReview.minEvaluationScore) {
    reasons.push({
      code: "low_evaluation",
      severity: "warn",
      message: `Evaluation estimate ${evaluation.score} is below the ${policy.humanReview.minEvaluationScore} review threshold`,
    });
  }
  if (policy.humanReview.onHighBusinessRisk && profile.businessRisk === "high") {
    reasons.push({ code: "business_risk", severity: "warn", message: "High business risk: output reaches an external or regulated audience" });
  }
  if (policy.humanReview.onQualityThresholdMiss && !ctx.qualityThresholdMet) {
    reasons.push({ code: "threshold_miss", severity: "warn", message: "No model met the quality threshold for this task" });
  }
  if (policy.humanReview.onFallback && ctx.fallbackUsed) {
    reasons.push({ code: "fallback", severity: "info", message: "Served by a fallback model after a provider failure" });
  }
  return { required: reasons.length > 0, reasons };
}
