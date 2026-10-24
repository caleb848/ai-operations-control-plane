import { CLASSIFICATION_LABEL, exceeds } from "../security/classification";
import { redactSecrets } from "../security/redact";
import type { CloudPermission, DataClassification, GovernancePolicy, ModelDescriptor, Reason } from "../types";

export interface PolicyVerdict {
  allowed: boolean;
  reasons: Reason[];
}

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  ollama: "Ollama",
};

/**
 * Decides whether a model may receive data of a given classification.
 * Availability, context fit and budget are separate gates in the router;
 * this function answers only "does policy permit it".
 */
export function evaluatePolicy(
  model: ModelDescriptor,
  classification: DataClassification,
  policy: GovernancePolicy,
  permission?: CloudPermission,
): PolicyVerdict {
  const label = CLASSIFICATION_LABEL[classification].toUpperCase();

  if (model.local) {
    return {
      allowed: true,
      reasons: [
        {
          code: "local_execution",
          severity: "pass",
          message: "Runs on this device; no external data transfer",
        },
      ],
    };
  }

  const rule = policy.rules[classification];
  const provider = PROVIDER_LABEL[model.providerId] ?? model.providerId;

  if (rule.cloudAccess === "prohibited") {
    return {
      allowed: false,
      reasons: [{ code: "cloud_prohibited", severity: "block", message: `Cloud execution prohibited for ${label} data` }],
    };
  }

  if (exceeds(classification, model.privacyEligibility)) {
    return {
      allowed: false,
      reasons: [
        {
          code: "model_not_approved",
          severity: "block",
          message: `${model.shortName} is approved for data up to ${CLASSIFICATION_LABEL[model.privacyEligibility]} only`,
        },
      ],
    };
  }

  if (rule.cloudAccess !== "allowed" && !rule.approvedProviders.includes(model.providerId)) {
    return {
      allowed: false,
      reasons: [{ code: "provider_not_approved", severity: "block", message: `${provider} is not an approved provider for ${label} data` }],
    };
  }

  if (rule.cloudAccess === "explicit_permission") {
    const justification = permission?.justification?.trim();
    if (!permission?.granted || !justification) {
      return {
        allowed: false,
        reasons: [
          {
            code: "permission_required",
            severity: "block",
            message: `Cloud execution prohibited for ${label} data without explicit permission`,
          },
        ],
      };
    }
    return {
      allowed: true,
      reasons: [
        {
          code: "permission_granted",
          severity: "warn",
          message: `Explicit cloud permission granted: "${redactSecrets(justification).slice(0, 120)}"`,
        },
      ],
    };
  }

  return {
    allowed: true,
    reasons: [
      {
        code: rule.cloudAccess === "allowed" ? "cloud_allowed" : "provider_approved",
        severity: "pass",
        message:
          rule.cloudAccess === "allowed"
            ? `Cloud permitted for ${label} data`
            : `${provider} is approved for ${label} data`,
      },
    ],
  };
}

/** True when policy leaves no cloud route for this classification (with or without permission). */
export function requiresLocal(policy: GovernancePolicy, classification: DataClassification, permission?: CloudPermission): boolean {
  const rule = policy.rules[classification];
  if (rule.cloudAccess === "prohibited") return true;
  if (rule.cloudAccess === "explicit_permission") return !(permission?.granted && permission.justification?.trim());
  return rule.approvedProviders.length === 0 && rule.cloudAccess === "approved_providers";
}
