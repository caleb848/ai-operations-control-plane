import type { CloudAccess, DataClassification, GovernancePolicy } from "../types";

/**
 * Default local-first governance policy.
 *
 *   PUBLIC        local or any configured cloud provider
 *   INTERNAL      local or an approved cloud provider
 *   CONFIDENTIAL  prefer local; cloud only with explicit, justified permission
 *   RESTRICTED    local only
 *
 * Non-configurable guardrails (enforced in code, not policy data):
 *   - Fail closed: if policy requires local and the local provider is down, block.
 *   - Fallback never crosses a policy boundary; fallback chains contain only eligible models.
 *   - A declared classification can raise the detected level, never lower it.
 */
export const DEFAULT_POLICY: GovernancePolicy = {
  version: 1,
  rules: {
    public: {
      classification: "public",
      cloudAccess: "allowed",
      approvedProviders: ["anthropic", "openai", "google"],
      preferLocal: false,
      requireHumanReview: false,
    },
    internal: {
      classification: "internal",
      cloudAccess: "approved_providers",
      approvedProviders: ["anthropic"],
      preferLocal: false,
      requireHumanReview: false,
    },
    confidential: {
      classification: "confidential",
      cloudAccess: "explicit_permission",
      approvedProviders: ["anthropic"],
      preferLocal: true,
      requireHumanReview: true,
    },
    restricted: {
      classification: "restricted",
      cloudAccess: "prohibited",
      approvedProviders: [],
      preferLocal: true,
      requireHumanReview: true,
    },
  },
  humanReview: {
    minEvaluationScore: 70,
    onHighBusinessRisk: true,
    onQualityThresholdMiss: true,
    onFallback: false,
  },
};

export const CLOUD_ACCESS_LABEL: Record<CloudAccess, string> = {
  allowed: "Cloud allowed",
  approved_providers: "Approved providers only",
  explicit_permission: "Explicit permission required",
  prohibited: "Cloud prohibited",
};

export function describeRule(policy: GovernancePolicy, c: DataClassification): string {
  const rule = policy.rules[c];
  switch (rule.cloudAccess) {
    case "allowed":
      return "Local or cloud";
    case "approved_providers":
      return `Local or approved cloud (${rule.approvedProviders.join(", ") || "none"})`;
    case "explicit_permission":
      return "Prefer local · cloud only with explicit permission";
    case "prohibited":
      return "Local only";
  }
}

/** Validates an edited policy. Guardrails that keep data safe cannot be relaxed through the UI. */
export function validatePolicy(p: GovernancePolicy): string[] {
  const errors: string[] = [];
  if (p.rules.restricted.cloudAccess !== "prohibited") errors.push("Restricted data must remain local-only.");
  if (p.rules.confidential.cloudAccess !== "explicit_permission" && p.rules.confidential.cloudAccess !== "prohibited") {
    errors.push("Confidential data may reach cloud only with explicit permission (or never).");
  }
  if (!p.rules.restricted.requireHumanReview) errors.push("Restricted outputs must require human review.");
  const order: CloudAccess[] = ["allowed", "approved_providers", "explicit_permission", "prohibited"];
  const levels: DataClassification[] = ["public", "internal", "confidential", "restricted"];
  for (let i = 1; i < levels.length; i++) {
    if (order.indexOf(p.rules[levels[i]].cloudAccess) < order.indexOf(p.rules[levels[i - 1]].cloudAccess)) {
      errors.push(`${levels[i]} cannot have looser cloud access than ${levels[i - 1]}.`);
    }
  }
  if (p.humanReview.minEvaluationScore < 0 || p.humanReview.minEvaluationScore > 100) {
    errors.push("Minimum evaluation score must be between 0 and 100.");
  }
  return errors;
}
