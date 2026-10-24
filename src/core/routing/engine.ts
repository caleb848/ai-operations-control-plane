import { checkBudget, type BudgetSnapshot } from "../budget/budget";
import { COMPLEXITY_LABEL, taskTypeLabel } from "../classification/classify";
import { evaluatePolicy, requiresLocal } from "../governance/evaluate";
import { DEFAULT_COST_LIMITS, estimateCost, formatUsd, type CostLimits } from "../pricing/cost";
import { CLASSIFICATION_LABEL, classificationRank } from "../security/classification";
import type {
  CandidateEvaluation,
  CandidateStatus,
  CapabilityProfile,
  CloudPermission,
  CostEstimate,
  Factor,
  FactorScores,
  GovernancePolicy,
  LatencyEstimate,
  ModelDescriptor,
  PriorityMode,
  Reason,
  RoutingDecision,
  TaskProfile,
  TaskType,
} from "../types";
import {
  CLOUD_PRIVACY_SCORE,
  COST_REFERENCE_USD,
  MODE_WEIGHTS,
  PRIORITY_LABEL,
  REASONING_SHARE,
  REQUIRED_QUALITY,
  TASK_FIT_WEIGHTS,
  TIE_BAND,
} from "./config";

export interface ModelAvailability {
  available: boolean;
  /** "simulated" = cloud model served by MockProvider because live mode is off. */
  backend: "real" | "simulated";
  /** Local only: model is resident in memory (no cold start). */
  warm?: boolean;
  reason: string;
}

export interface RouteRequest {
  profile: TaskProfile;
  models: ModelDescriptor[];
  availability: Record<string, ModelAvailability>;
  policy: GovernancePolicy;
  priorityMode: PriorityMode;
  budget: BudgetSnapshot;
  permission?: CloudPermission;
  costLimits?: CostLimits;
  baselineModel?: ModelDescriptor;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function taskFitScore(cap: CapabilityProfile, type: TaskType): number {
  const weights = TASK_FIT_WEIGHTS[type];
  let total = 0;
  for (const [dim, w] of Object.entries(weights) as [keyof CapabilityProfile, number][]) total += cap[dim] * w;
  return total;
}

export function qualityScore(model: ModelDescriptor, profile: TaskProfile): { taskFit: number; quality: number } {
  const taskFit = taskFitScore(model.capabilities, profile.taskType);
  const r = REASONING_SHARE[profile.complexity];
  return { taskFit, quality: taskFit * (1 - r) + model.capabilities.reasoning * r };
}

export function estimateLatency(model: ModelDescriptor, cost: CostEstimate, warm: boolean): LatencyEstimate {
  const l = model.latency;
  const coldStartMs = model.local && !warm ? l.coldStartMs : 0;
  const totalMs =
    l.overheadMs +
    (cost.inputTokens / l.prefillTokensPerSec) * 1000 +
    (cost.outputTokens / l.outputTokensPerSec) * 1000 +
    coldStartMs;
  return { totalMs: Math.round(totalMs), coldStartMs, source: l.source };
}

/** 100 at ≤1 s, −18 points per doubling (≈10 at 32 s). */
export const latencyFactor = (ms: number) => clamp(100 - 18 * Math.log2(Math.max(1, ms / 1000)));

/** 100 at $0, 0 at ≥ COST_REFERENCE_USD, square-root scale so small spends still register. */
export const costFactor = (usd: number) => clamp(100 * (1 - Math.sqrt(Math.min(usd, COST_REFERENCE_USD) / COST_REFERENCE_USD)));

export const privacyFactor = (model: ModelDescriptor, profile: TaskProfile) =>
  model.local ? 100 : CLOUD_PRIVACY_SCORE[profile.classification];

const STATUS_ORDER: CandidateStatus[] = [
  "selected",
  "eligible",
  "below_threshold",
  "over_budget",
  "context_exceeded",
  "unavailable",
  "blocked_policy",
  "disabled",
];

const HARD_GATED: CandidateStatus[] = ["blocked_policy", "unavailable", "context_exceeded", "disabled"];

/** Whether a candidate may be executed when pinned (Comparison Lab). Below-threshold runs are allowed as experiments. */
export function isRunnable(status: CandidateStatus): boolean {
  return status === "selected" || status === "eligible" || status === "below_threshold";
}

function seconds(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}

export function route(req: RouteRequest): RoutingDecision {
  const { profile, policy, priorityMode, budget, permission } = req;
  const limits = req.costLimits ?? DEFAULT_COST_LIMITS;
  const weights = MODE_WEIGHTS[priorityMode];
  const rule = policy.rules[profile.classification];
  const required = REQUIRED_QUALITY[profile.complexity];
  const r = REASONING_SHARE[profile.complexity];
  const classLabel = CLASSIFICATION_LABEL[profile.classification].toUpperCase();

  const candidates: CandidateEvaluation[] = req.models.map((model) => {
    const availability = req.availability[model.id] ?? { available: false, backend: "real", reason: "Provider status unknown" };
    const cost = estimateCost(model, profile, limits);
    const latency = estimateLatency(model, cost, availability.warm ?? false);
    const { taskFit, quality } = qualityScore(model, profile);

    const factors: FactorScores = {
      privacy: privacyFactor(model, profile),
      cost: costFactor(cost.costUsd),
      taskFit: round1(taskFit),
      reasoning: model.capabilities.reasoning,
      latency: round1(latencyFactor(latency.totalMs)),
    };
    factors.cost = round1(factors.cost);

    const effectiveQuality = quality <= required ? quality : required + (quality - required) * weights.headroom;
    const qualityPart = weights.quality * effectiveQuality;
    const fitShare = quality > 0 ? (taskFit * (1 - r)) / quality : 0.5;
    const contributions: Record<Factor, number> = {
      taskFit: round1(qualityPart * fitShare),
      reasoning: round1(qualityPart * (1 - fitShare)),
      cost: round1(weights.cost * factors.cost),
      latency: round1(weights.latency * factors.latency),
      privacy: round1(weights.privacy * factors.privacy),
    };
    const score = round1(qualityPart + weights.cost * factors.cost + weights.latency * factors.latency + weights.privacy * factors.privacy);

    const reasons: Reason[] = [];
    let status: CandidateStatus = "eligible";

    const verdict = evaluatePolicy(model, profile.classification, policy, permission);
    const contextNeeded = cost.inputTokens + cost.maxOutputTokens;

    if (!model.enabled) {
      status = "disabled";
      reasons.push({ code: "disabled", severity: "block", message: "Disabled in the model registry" });
    } else if (!verdict.allowed) {
      status = "blocked_policy";
      reasons.push(...verdict.reasons);
    } else {
      reasons.push(...verdict.reasons);
      if (!availability.available) {
        status = "unavailable";
        reasons.push({ code: "unavailable", severity: "block", message: availability.reason });
      } else if (contextNeeded > model.contextWindowTokens) {
        status = "context_exceeded";
        reasons.push({
          code: "context_exceeded",
          severity: "block",
          message: `Needs ~${contextNeeded.toLocaleString()} tokens; effective context is ${model.contextWindowTokens.toLocaleString()}`,
        });
      } else {
        reasons.push({ code: "available", severity: availability.backend === "simulated" ? "info" : "pass", message: availability.reason });
        if (quality >= required) {
          reasons.push({
            code: "quality_ok",
            severity: "pass",
            message: `Quality ${Math.round(quality)} meets the ${required} required for ${COMPLEXITY_LABEL[profile.complexity].toLowerCase()} complexity`,
          });
        } else {
          status = "below_threshold";
          reasons.push({
            code: "below_threshold",
            severity: "warn",
            message: `Quality ${Math.round(quality)} is below the ${required} required for ${COMPLEXITY_LABEL[profile.complexity].toLowerCase()} complexity`,
          });
        }
      }
    }

    reasons.push(
      model.local
        ? { code: "cost", severity: "pass", message: "External API cost $0.00 (local compute)" }
        : {
            code: "cost",
            severity: "info",
            message: `Est. ${formatUsd(cost.costUsd)} · worst case ${formatUsd(cost.maxCostUsd)} at ${cost.maxOutputTokens.toLocaleString()} max tokens`,
          },
    );
    if (!model.local && cost.outputTokens >= cost.maxOutputTokens) {
      reasons.push({
        code: "truncation_risk",
        severity: "warn",
        message: `Expected output incl. reasoning may reach the ${cost.maxOutputTokens.toLocaleString()}-token cap (truncation risk)`,
      });
    }
    reasons.push({
      code: "latency",
      severity: "info",
      message: `Est. ${seconds(latency.totalMs)}${latency.coldStartMs ? ` incl. ${seconds(latency.coldStartMs)} cold start` : ""} (${latency.source})`,
    });

    return {
      modelId: model.id,
      displayName: model.displayName,
      shortName: model.shortName,
      providerId: model.providerId,
      location: model.location,
      tier: model.tier,
      status,
      reasons,
      factors,
      quality: { score: round1(quality), required, meets: quality >= required },
      routingScore: HARD_GATED.includes(status) ? null : score,
      contributions,
      cost,
      latency,
      rank: null,
    };
  });

  const byScore = (a: CandidateEvaluation, b: CandidateEvaluation) => {
    const d = (b.routingScore ?? -1) - (a.routingScore ?? -1);
    if (Math.abs(d) > TIE_BAND) return d;
    if (a.cost.costUsd !== b.cost.costUsd) return a.cost.costUsd - b.cost.costUsd;
    return a.latency.totalMs - b.latency.totalMs;
  };

  const rationale: Reason[] = [];
  const blockedByPolicy = candidates.filter((c) => c.status === "blocked_policy");

  if (profile.findings.length) {
    const top = profile.findings
      .slice(0, 3)
      .map((f) => (f.count > 1 && f.kind !== "marker" ? `${f.count}× ${f.label.toLowerCase()}` : f.label.toLowerCase()))
      .join(", ");
    rationale.push({ code: "sensitivity", severity: "info", message: `${CLASSIFICATION_LABEL[profile.classification]} data detected: ${top}` });
  } else {
    rationale.push({ code: "sensitivity", severity: "info", message: `Classified ${CLASSIFICATION_LABEL[profile.classification]}: ${profile.classificationReason}` });
  }
  if (blockedByPolicy.some((c) => c.location === "cloud")) {
    rationale.push({
      code: "transfer_restricted",
      severity: "block",
      message: `External data transfer restricted: ${blockedByPolicy.filter((c) => c.location === "cloud").length} cloud model(s) blocked by ${classLabel} policy`,
    });
  }

  // ---- Selection -----------------------------------------------------------
  let pool = candidates.filter((c) => c.status === "eligible").sort(byScore);
  let qualityThresholdMet = true;

  const localInPool = pool.some((c) => c.location === "local");
  const cloudInPool = pool.some((c) => c.location === "cloud");
  if (localInPool && cloudInPool && (rule.preferLocal || priorityMode === "privacy_first")) {
    const held = pool.filter((c) => c.location === "cloud");
    pool = pool.filter((c) => c.location === "local");
    for (const c of held) {
      c.reasons.push({
        code: "prefer_local",
        severity: "info",
        message: rule.preferLocal
          ? `Held back: ${classLabel} policy prefers local while a local model meets the threshold`
          : "Held back: Privacy first keeps data local while a local model meets the threshold",
      });
    }
    rationale.push({
      code: "prefer_local",
      severity: "info",
      message: rule.preferLocal
        ? `${classLabel} policy prefers local execution; a local model meets the quality threshold`
        : "Privacy first: a local model meets the quality threshold, so data stays on the device",
    });
  }

  if (pool.length === 0) {
    const below = candidates.filter((c) => c.status === "below_threshold").sort(byScore);
    if (below.length) {
      pool = below;
      qualityThresholdMet = false;
    }
  }

  let selected: CandidateEvaluation | null = pool[0] ?? null;
  let block: RoutingDecision["block"] = null;
  let budgetGuard: RoutingDecision["budgetGuard"] = null;

  if (!selected) {
    const localModels = candidates.filter((c) => c.location === "local" && c.status !== "disabled");
    const localRequired = requiresLocal(policy, profile.classification, permission);
    if (localRequired && localModels.every((c) => c.status === "unavailable")) {
      block = {
        code: "local_required_unavailable",
        message: "Local execution required by policy, but the approved local provider is unavailable.",
      };
    } else {
      block = { code: "no_eligible_model", message: "No model satisfies policy, availability and context requirements for this request." };
    }
    rationale.push({ code: block.code, severity: "block", message: block.message });
    if (localRequired) {
      rationale.push({ code: "fail_closed", severity: "block", message: "Fail-closed: data was not sent to a cloud provider as a fallback" });
    }
  }

  // ---- Budget guard --------------------------------------------------------
  if (selected && selected.location === "cloud") {
    const check = checkBudget(budget, selected.cost.maxCostUsd);
    if (!check.allowed) {
      const original = selected;
      for (const c of candidates) {
        if (c.location === "cloud" && (c.status === "eligible" || c.status === "below_threshold") && c.cost.maxCostUsd > check.remainingUsd) {
          c.status = "over_budget";
          c.reasons.push({
            code: "over_budget",
            severity: "block",
            message: `Worst case ${formatUsd(c.cost.maxCostUsd)} exceeds remaining budget ${formatUsd(check.remainingUsd)}`,
          });
        }
      }
      const capable = candidates.filter((c) => c.status === "eligible").sort(byScore);
      // Preserve the remaining budget: a capable local model first, else the cheapest capable cloud model that fits.
      const alternative =
        capable.find((c) => c.location === "local") ?? [...capable].sort((a, b) => a.cost.costUsd - b.cost.costUsd)[0] ?? null;
      const budgetNote = budget.simulated ? " (scenario-simulated session spend)" : "";
      if (alternative) {
        selected = alternative;
        pool = capable;
        qualityThresholdMet = true;
        budgetGuard = {
          triggered: true,
          originalModelId: original.modelId,
          reroutedToModelId: alternative.modelId,
          remainingUsd: check.remainingUsd,
          requiredUsd: check.requiredUsd,
          message: `Budget Guard triggered${budgetNote}: ${original.shortName} needs up to ${formatUsd(check.requiredUsd)}, ${formatUsd(check.remainingUsd)} remains. ${alternative.location === "local" ? "Capable local alternative available; rerouted" : "Rerouted to a cheaper capable model"} to ${alternative.shortName}.`,
        };
        rationale.push({ code: "budget_guard", severity: "warn", message: budgetGuard.message });
        for (const c of capable) {
          if (c !== alternative && c.location === "cloud") {
            c.reasons.push({
              code: "budget_prefers",
              severity: "info",
              message:
                alternative.location === "local"
                  ? "Not chosen: Budget Guard prefers a capable local model to preserve the remaining budget"
                  : "Not chosen: Budget Guard picks the cheapest capable model that fits",
            });
          }
        }
      } else {
        selected = null;
        block = { code: "budget_exhausted", message: `Session budget exhausted and no capable local alternative is available.${budgetNote}` };
        budgetGuard = {
          triggered: true,
          originalModelId: original.modelId,
          reroutedToModelId: null,
          remainingUsd: check.remainingUsd,
          requiredUsd: check.requiredUsd,
          message: block.message,
        };
        rationale.push({ code: "budget_exhausted", severity: "block", message: block.message });
      }
    }
  }

  // ---- Explanation ---------------------------------------------------------
  if (selected) {
    selected.status = "selected";
    const runnerUp = pool.find((c) => c !== selected && c.status === "eligible");

    if (selected.location === "local") {
      rationale.push({
        code: "local_ok",
        severity: "pass",
        message:
          classificationRank(profile.classification) >= classificationRank("confidential") || blockedByPolicy.length
            ? "Local execution satisfies the privacy policy"
            : "Runs on this device; data never leaves it",
      });
      rationale.push({ code: "zero_api_cost", severity: "pass", message: "No external API cost (local compute still applies)" });
    } else {
      rationale.push({
        code: "api_cost",
        severity: "info",
        message: `Estimated external API cost ${formatUsd(selected.cost.costUsd)}; worst case ${formatUsd(selected.cost.maxCostUsd)} fits the session budget`,
      });
    }

    rationale.push(
      qualityThresholdMet
        ? {
            code: "threshold_met",
            severity: "pass",
            message: `Quality ${Math.round(selected.quality.score)} meets the ${required} required for ${COMPLEXITY_LABEL[profile.complexity].toLowerCase()}-complexity ${taskTypeLabel(profile.taskType).toLowerCase()}`,
          }
        : {
            code: "threshold_missed",
            severity: "warn",
            message: `No eligible model reaches the ${required} quality threshold; best available selected and human review required`,
          },
    );

    if (runnerUp && !budgetGuard) {
      rationale.push({
        code: "score",
        severity: "pass",
        message: `Highest ${PRIORITY_LABEL[priorityMode]} score: ${Math.round(selected.routingScore ?? 0)} vs ${Math.round(runnerUp.routingScore ?? 0)} for ${runnerUp.shortName}`,
      });
    }

    // Economics: name the stronger model we chose not to pay for, and the cheaper ones that fell short.
    const stronger = candidates
      .filter((c) => c !== selected && (c.status === "eligible" || c.status === "over_budget") && c.quality.score > selected!.quality.score + 1)
      .sort((a, b) => b.quality.score - a.quality.score)[0];
    if (stronger && selected.cost.costUsd > 0 && weights.headroom < 1) {
      const ratio = stronger.cost.costUsd / Math.max(selected.cost.costUsd, 1e-9);
      rationale.push({
        code: "headroom",
        severity: "info",
        message: `${stronger.shortName} adds +${Math.round(stronger.quality.score - selected.quality.score)} quality for ${ratio.toFixed(1)}× the cost; quality above the requirement counts at ${Math.round(weights.headroom * 100)}% in ${PRIORITY_LABEL[priorityMode]} mode`,
      });
    } else if (stronger && selected.location === "local" && !budgetGuard && weights.headroom < 1) {
      rationale.push({
        code: "headroom",
        severity: "info",
        message: `${stronger.shortName} scores higher on quality, but the extra capability isn't needed to clear the threshold`,
      });
    }
    const cheaperShort = candidates.filter(
      (c) => c.status === "below_threshold" && c.cost.costUsd <= selected!.cost.costUsd && c !== selected,
    );
    if (cheaperShort.length && qualityThresholdMet) {
      rationale.push({
        code: "cheaper_below_threshold",
        severity: "info",
        message: `Considered but below the reasoning threshold: ${cheaperShort.map((c) => `${c.shortName} (${Math.round(c.quality.score)})`).join(", ")}`,
      });
    }
  }

  // ---- Fallback chain: only candidates that already passed every gate --------
  const fallbackChain = selected
    ? candidates
        .filter((c) => c !== selected && c.status === (qualityThresholdMet ? "eligible" : "below_threshold"))
        .filter((c) => c.location === "local" || checkBudget(budget, c.cost.maxCostUsd).allowed)
        .sort((a, b) => {
          // Local-preferring policies keep local alternatives ahead of cloud ones.
          if ((rule.preferLocal || priorityMode === "privacy_first") && a.location !== b.location) return a.location === "local" ? -1 : 1;
          return byScore(a, b);
        })
        .map((c) => c.modelId)
    : [];

  const ordered = [...candidates].sort((a, b) => {
    const s = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    return s !== 0 ? s : byScore(a, b);
  });
  ordered.forEach((c, i) => (c.rank = i + 1));

  const baselineModel = req.baselineModel;
  const baselineCost = baselineModel ? estimateCost(baselineModel, profile, limits).costUsd : 0;

  return {
    priorityMode,
    policyVersion: policy.version,
    weights,
    profile,
    rule,
    candidates: ordered,
    selectedModelId: selected?.modelId ?? null,
    fallbackChain,
    outcome: selected ? "routed" : "blocked",
    block,
    rationale,
    budgetGuard,
    qualityThresholdMet: selected ? qualityThresholdMet : false,
    baseline: { modelId: baselineModel?.id ?? "", costUsd: baselineCost },
    summary: {
      considered: candidates.length,
      eligible: candidates.filter((c) => ["selected", "eligible", "below_threshold", "over_budget"].includes(c.status)).length,
      blockedByPolicy: blockedByPolicy.length,
      belowThreshold: candidates.filter((c) => c.status === "below_threshold").length,
      unavailable: candidates.filter((c) => c.status === "unavailable").length,
    },
  };
}
