/**
 * Presentation model for routing decisions. Pure functions over the engine's
 * output: nothing here changes how a request is routed, it only decides how a
 * decision is explained. Every friendly line keeps the engine's own message as
 * its detail, so the plain-language version never drifts from the truth.
 */
import { COMPLEXITY_LABEL, taskTypeLabel } from "@/core/classification/classify";
import { PRIORITY_LABEL } from "@/core/routing/config";
import type { CandidateEvaluation, DataClassification, Reason, RoutingDecision } from "@/core/types";
import type { ExecutionRecord } from "@/services/observability/types";
import { isRunnable } from "@/core/routing/engine";
import { formatMs, formatTokens, formatUsd } from "./format";

export type Route = "local" | "cloud" | "blocked";
export type Destination = Route | "review";
export type Tone = "neutral" | Destination;

export const DESTINATION: Record<Destination, { label: string; short: string; tagline: string }> = {
  local: { label: "Local AI", short: "Local", tagline: "Private, on-device" },
  cloud: { label: "Cloud AI", short: "Cloud", tagline: "Capable, approved providers" },
  review: { label: "Human review", short: "Review", tagline: "A person approves the output" },
  blocked: { label: "Blocked", short: "Blocked", tagline: "Policy enforced, nothing sent" },
};

export const CLASSIFICATION_META: Record<DataClassification, { label: string; level: 1 | 2 | 3 | 4; blurb: string; reach: string }> = {
  public: { label: "Public", level: 1, blurb: "Safe to share", reach: "Any approved model, local or cloud" },
  internal: { label: "Internal", level: 2, blurb: "Company only", reach: "Local, or cloud providers the company approved" },
  confidential: { label: "Confidential", level: 3, blurb: "Client or sensitive data", reach: "Local by default; cloud only by justified exception" },
  restricted: { label: "Restricted", level: 4, blurb: "Regulated or personal", reach: "Local only, always reviewed" },
};

export function selectedOf(d: RoutingDecision): CandidateEvaluation | null {
  return d.candidates.find((c) => c.modelId === d.selectedModelId) ?? null;
}

export function routeOf(d: RoutingDecision): Route {
  const s = selectedOf(d);
  return !s ? "blocked" : s.location;
}

/** Where a finished request actually ran (it can differ from the plan after a fallback). */
export function routeOfRecord(r: Pick<ExecutionRecord, "status" | "location">): Route | "failed" {
  if (r.status === "blocked") return "blocked";
  if (r.status === "failed") return "failed";
  return r.location ?? "blocked";
}

export interface ReviewSignal {
  required: boolean;
  /** Policy or a finished run decided it; otherwise it depends on the output. */
  certain: boolean;
  reasons: string[];
}

export function reviewOf(d: RoutingDecision, r?: Pick<ExecutionRecord, "review" | "status"> | null): ReviewSignal {
  if (r?.review) return { required: r.review.required, certain: true, reasons: r.review.reasons.map((x) => friendlyReview(x)) };
  if (d.outcome === "blocked") return { required: false, certain: true, reasons: [] };
  const reasons: string[] = [];
  if (d.rule.requireHumanReview) reasons.push(`${CLASSIFICATION_META[d.profile.classification].label} data is always reviewed`);
  if (!d.qualityThresholdMet) reasons.push("No model meets the quality bar");
  if (reasons.length) return { required: true, certain: true, reasons };
  if (d.profile.businessRisk === "high") return { required: true, certain: false, reasons: ["High business risk: reviewed before use"] };
  return { required: false, certain: false, reasons: ["Only if the output scores below 70"] };
}

/** A held output's reason, in a few plain words (the engine's full message stays available as detail). */
export function reviewReasonLabel(r: Reason): string {
  return friendlyReview(r);
}

function friendlyReview(r: Reason): string {
  switch (r.code) {
    case "classification":
      return r.message.replace(/: policy requires human review before use$/, " is always reviewed");
    case "business_risk":
      return "High business risk: reviewed before use";
    case "low_evaluation":
      return "Low evaluation score";
    case "threshold_miss":
      return "No model met the quality bar";
    case "fallback":
      return "Served by a fallback model";
    case "cloud_permission":
      return "Sent to cloud under a policy exception";
    default:
      return r.message;
  }
}

// ---------------------------------------------------------------------------
// Route stages
// ---------------------------------------------------------------------------

export interface Stage {
  key: "request" | "classify" | "policy" | "capability" | "economics";
  label: string;
  value: string;
  sub: string;
  tone: Tone;
}

const ACCESS_SHORT: Record<RoutingDecision["rule"]["cloudAccess"], string> = {
  allowed: "Local or cloud",
  approved_providers: "Approved providers",
  explicit_permission: "Cloud by exception only",
  prohibited: "Local only",
};

/** "Very High" → "Very high", for labels that sit inside a sentence. */
export const sentenceCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function stagesOf(d: RoutingDecision): Stage[] {
  const p = d.profile;
  const sel = selectedOf(d);
  const cloud = d.candidates.filter((c) => c.location === "cloud");
  const cloudBlocked = cloud.filter((c) => c.status === "blocked_policy").length;
  const allCloudBlocked = cloud.length > 0 && cloudBlocked === cloud.length;
  const findings = p.findings.reduce((s, f) => s + f.count, 0);
  const meta = CLASSIFICATION_META[p.classification];

  const policyValue = d.rule.cloudAccess === "prohibited" ? "Local only" : allCloudBlocked ? "Cloud blocked" : cloudBlocked ? `${cloudBlocked} model${cloudBlocked > 1 ? "s" : ""} excluded` : ACCESS_SHORT[d.rule.cloudAccess];
  const policySub =
    d.rule.cloudAccess === "prohibited"
      ? "This data never leaves the device"
      : d.rule.cloudAccess === "explicit_permission"
        ? allCloudBlocked
          ? "Cloud only with an approved exception"
          : "Exception approved for cloud"
        : d.summary.blockedByPolicy
          ? `${d.summary.blockedByPolicy} of ${d.summary.considered} models excluded`
          : "Every model eligible";

  const qualifying = d.candidates.filter((c) => c.quality.meets && (c.status === "selected" || c.status === "eligible" || c.status === "over_budget")).length;
  const localDown = d.candidates.filter((c) => c.location === "local").every((c) => c.status === "unavailable" || c.status === "disabled");
  const required = sel?.quality.required ?? d.candidates.find((c) => c.quality.required)?.quality.required ?? 0;
  const capValue = d.outcome === "blocked" && localDown ? "No local model online" : `${qualifying} model${qualifying === 1 ? "" : "s"} qualify`;
  const capSub = `Quality bar ${required} for ${COMPLEXITY_LABEL[p.complexity].toLowerCase()} complexity`;

  const guard = d.budgetGuard?.triggered ? d.budgetGuard : null;
  const original = guard ? d.candidates.find((c) => c.modelId === guard.originalModelId) : null;
  let econValue: string;
  let econSub: string;
  let econTone: Tone = "neutral";
  if (guard) {
    econValue = "Budget Guard";
    econSub = `${original?.shortName ?? "Cloud"} needs ${formatUsd(guard.requiredUsd)}, ${formatUsd(guard.remainingUsd)} left`;
    econTone = "review";
  } else if (!sel) {
    econValue = "Nothing spent";
    econSub = "Blocked before any model ran";
  } else if (sel.location === "local") {
    econValue = "$0.00";
    econSub = "External API cost, local compute";
  } else {
    const priciest = cloud.filter((c) => c.status === "eligible" || c.status === "selected").sort((a, b) => b.cost.costUsd - a.cost.costUsd)[0];
    econValue = formatUsd(sel.cost.costUsd);
    econSub = priciest && priciest !== sel ? `vs ${formatUsd(priciest.cost.costUsd)} for ${priciest.shortName}` : `Worst case ${formatUsd(sel.cost.maxCostUsd)}`;
  }

  return [
    { key: "request", label: "Request", value: taskTypeLabel(p.taskType), sub: `${sentenceCase(COMPLEXITY_LABEL[p.complexity])} complexity · ~${formatTokens(p.estimatedInputTokens)} input tokens`, tone: "neutral" },
    {
      key: "classify",
      label: "Classification",
      value: meta.label,
      sub: findings ? `${findings} sensitive finding${findings > 1 ? "s" : ""}` : p.declaredClassification ? "As declared" : "No sensitive data found",
      tone: "neutral",
    },
    { key: "policy", label: "Policy", value: policyValue, sub: policySub, tone: d.rule.cloudAccess === "prohibited" || allCloudBlocked ? "blocked" : "neutral" },
    { key: "capability", label: "Capability", value: capValue, sub: capSub, tone: d.outcome === "blocked" && localDown ? "blocked" : "neutral" },
    { key: "economics", label: "Economics", value: econValue, sub: econSub, tone: econTone },
  ];
}

// ---------------------------------------------------------------------------
// Why this route
// ---------------------------------------------------------------------------

export interface WhyItem {
  code: string;
  tone: "pass" | "info" | "warn" | "block";
  title: string;
  detail: string;
}

export function whyOf(d: RoutingDecision, limit = 5): WhyItem[] {
  const sel = selectedOf(d);
  const cls = CLASSIFICATION_META[d.profile.classification].label;
  const sensitive = d.profile.classification === "confidential" || d.profile.classification === "restricted";
  const cloudBlocked = d.candidates.filter((c) => c.location === "cloud" && c.status === "blocked_policy").length;
  const items: WhyItem[] = [];
  for (const r of d.rationale) {
    const t = titleFor(r, d, sel, cls, sensitive, cloudBlocked);
    if (t) items.push({ code: r.code, tone: r.severity, title: t, detail: r.message });
  }
  const order =
    d.outcome === "blocked"
      ? BLOCKED_ORDER
      : d.budgetGuard?.triggered
        ? GUARD_ORDER
        : sel?.location === "local"
          ? sensitive || cloudBlocked
            ? LOCAL_PRIVATE_ORDER
            : LOCAL_ORDER
          : CLOUD_ORDER;
  const rank = (code: string) => {
    const i = order.indexOf(code);
    return i === -1 ? order.length : i;
  };
  const seen = new Set<string>();
  return items
    .sort((a, b) => rank(a.code) - rank(b.code))
    .filter((i) => (seen.has(i.title) ? false : (seen.add(i.title), true)))
    .slice(0, limit);
}

const BLOCKED_ORDER = ["local_required_unavailable", "no_eligible_model", "budget_exhausted", "fail_closed", "transfer_restricted", "sensitivity"];
// Answer first, then cause: what was detected, what policy did, what it cost.
const GUARD_ORDER = ["budget_guard", "zero_api_cost", "threshold_met", "threshold_missed", "local_ok", "sensitivity", "score"];
const LOCAL_PRIVATE_ORDER = ["local_ok", "sensitivity", "transfer_restricted", "prefer_local", "threshold_met", "threshold_missed", "zero_api_cost", "headroom", "score"];
const LOCAL_ORDER = ["score", "prefer_local", "zero_api_cost", "threshold_met", "threshold_missed", "headroom", "local_ok", "sensitivity"];
const CLOUD_ORDER = ["score", "api_cost", "headroom", "cheaper_below_threshold", "threshold_met", "threshold_missed", "sensitivity"];

function titleFor(r: Reason, d: RoutingDecision, sel: CandidateEvaluation | null, cls: string, sensitive: boolean, cloudBlocked: number): string | null {
  switch (r.code) {
    case "sensitivity":
      return d.profile.findings.length ? `${cls} data detected` : d.profile.classification === "public" ? "No sensitive data found" : `Treated as ${cls.toLowerCase()} data`;
    case "transfer_restricted":
      return `${cloudBlocked} cloud model${cloudBlocked === 1 ? "" : "s"} blocked by privacy policy`;
    case "prefer_local":
      return r.message.startsWith("Privacy first") ? "Privacy first keeps it on-device" : "Policy prefers keeping it local";
    case "local_required_unavailable":
      return "Local execution required, none available";
    case "no_eligible_model":
      return "No model satisfies policy and capability";
    case "fail_closed":
      return "Nothing was sent externally";
    case "budget_guard":
      return `Budget Guard rerouted to ${sel?.shortName ?? "a cheaper model"}`;
    case "budget_exhausted":
      return "Budget exhausted, no capable local alternative";
    case "local_ok":
      return sensitive || cloudBlocked ? "Sensitive data stays on-device" : "Data never leaves the device";
    case "zero_api_cost":
      return "$0 external API cost";
    case "api_cost":
      return sel ? `About ${formatUsd(sel.cost.costUsd)} for this request` : null;
    case "threshold_met":
      return "Capability threshold satisfied";
    case "threshold_missed":
      return "No model meets the quality bar";
    case "score":
      return `Best overall value in ${PRIORITY_LABEL[d.priorityMode]} mode`;
    case "headroom":
      return sel?.location === "local" ? "Extra capability isn't needed here" : "More intelligence isn't always more value";
    case "cheaper_below_threshold":
      return "Cheaper models fall short of the task";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export const CANDIDATE_LABEL: Record<CandidateEvaluation["status"], string> = {
  selected: "Selected",
  eligible: "Eligible",
  below_threshold: "Below the quality bar",
  over_budget: "Over budget",
  blocked_policy: "Blocked by privacy policy",
  unavailable: "Unavailable",
  context_exceeded: "Context too small",
  disabled: "Disabled",
};

/** The one reason a candidate wasn't chosen, in plain language. */
export function candidateWhy(c: CandidateEvaluation): string | null {
  const r = c.reasons.find((x) => x.severity === "block") ?? c.reasons.find((x) => x.code === "prefer_local" || x.code === "budget_prefers") ?? c.reasons.find((x) => x.severity === "warn" && x.code !== "truncation_risk");
  return r?.message ?? null;
}

// ---------------------------------------------------------------------------
// Scenario stories
// ---------------------------------------------------------------------------

export interface ScenarioStory {
  title: string;
  story: string;
  classification: DataClassification;
  /** The destination this scenario demonstrates, plus a second stop when there is one. */
  destination: Destination;
  then?: Destination;
  cue: string;
  /** What to do next when the scenario's point only shows after Run. */
  runHint?: string;
}

export const SCENARIO_STORY: Record<string, ScenarioStory> = {
  "confidential-client-brief": {
    title: "Keep the brief private",
    story: "Confidential client data should stay on-device.",
    classification: "confidential",
    destination: "local",
    then: "review",
    cue: "Stays local, then reviewed",
  },
  "public-summary": {
    title: "Don't overpay for a simple task",
    story: "See why the most expensive model isn't always the right model.",
    classification: "public",
    destination: "cloud",
    cue: "Economical cloud model",
  },
  "strategic-positioning": {
    title: "Strategy needs more intelligence",
    story: "Watch quality outweigh pure cost.",
    classification: "internal",
    destination: "cloud",
    cue: "Stronger cloud model",
  },
  "provider-failure": {
    title: "Cloud provider goes down",
    story: "See policy-approved fallback behavior.",
    classification: "public",
    destination: "cloud",
    then: "local",
    cue: "Falls back to local",
    runHint: "Press Run: the Anthropic call is set to fail, and a policy-approved local model takes over.",
  },
  "budget-exhausted": {
    title: "Budget exhausted",
    story: "Watch Budget Guard intervene.",
    classification: "internal",
    destination: "local",
    cue: "Rerouted to local",
  },
  "restricted-local-offline": {
    title: "Local required. Local unavailable.",
    story: "See the system fail closed instead of leaking restricted data.",
    classification: "restricted",
    destination: "blocked",
    cue: "Blocked, nothing sent",
  },
};

// ---------------------------------------------------------------------------
// Value lessons (Comparison Lab)
// ---------------------------------------------------------------------------

const times = (r: number) => (r >= 10 ? `${Math.round(r)}×` : `${r.toFixed(1)}×`);

export interface Takeaway {
  title: string;
  body: string;
}

/** The two value lessons, stated with this task's own numbers. */
export function valueTakeaways(d: RoutingDecision): Takeaway[] {
  const sel = selectedOf(d);
  if (!sel) return [];
  const mode = PRIORITY_LABEL[d.priorityMode];
  const req = sel.quality.required;
  const q = (c: CandidateEvaluation) => Math.round(c.quality.score);
  const cost = (c: CandidateEvaluation) => (c.location === "local" ? "$0" : formatUsd(c.cost.costUsd));
  const runnable = d.candidates.filter((c) => isRunnable(c.status));
  const out: Takeaway[] = [];

  const local = runnable.filter((c) => c.location === "local" && c !== sel).sort((a, b) => (b.routingScore ?? 0) - (a.routingScore ?? 0))[0];
  const cloudBlocked = d.candidates.filter((c) => c.location === "cloud").every((c) => c.status === "blocked_policy");
  if (sel.location === "cloud" && local) {
    out.push({
      title: "Free isn't automatically best",
      body:
        local.status === "below_threshold"
          ? `${local.shortName} costs $0 but scores ${q(local)} against a bar of ${req}. Below the bar, free means a weaker answer.`
          : `${local.shortName} is free and clears the bar, but ${sel.shortName} scores higher in ${mode} mode: quality ${q(sel)} vs ${q(local)}, about ${formatMs(sel.latency.totalMs)} instead of ${formatMs(local.latency.totalMs)}, for ${cost(sel)}.`,
    });
  } else if (sel.location === "local") {
    out.push({
      title: cloudBlocked ? "Policy keeps this one local" : "Free is enough here",
      body: cloudBlocked
        ? `Cloud models are blocked for ${CLASSIFICATION_META[d.profile.classification].label.toLowerCase()} data. ${sel.shortName} clears the bar of ${req} with ${q(sel)}, at $0 in API fees.`
        : `${sel.shortName} clears the bar of ${req} with ${q(sel)} at $0 in API fees, so paying for a cloud model buys nothing this task needs.`,
    });
  }

  const stronger = runnable.filter((c) => c !== sel && c.quality.score > sel.quality.score + 1).sort((a, b) => b.quality.score - a.quality.score)[0];
  if (stronger) {
    const pricier = stronger.cost.costUsd > sel.cost.costUsd;
    out.push({
      title: "More intelligence isn't always more value",
      body: `${stronger.shortName} scores ${q(stronger)} against a bar of ${req}, ${pricier ? (sel.cost.costUsd > 0 ? `but costs ${times(stronger.cost.costUsd / sel.cost.costUsd)} as much as ${sel.shortName}` : `but costs ${cost(stronger)} a request instead of $0`) : `but loses on the other factors`}. Quality above the bar counts for less in ${mode} mode.`,
    });
  } else {
    const short = d.candidates.filter((c) => c.status === "below_threshold");
    out.push({
      title: "Here, more intelligence is worth it",
      body: short.length
        ? `The task needs quality ${req}. ${short.map((c) => `${c.shortName} (${q(c)})`).join(", ")} fall short; ${sel.shortName} clears it with ${q(sel)}.`
        : `${sel.shortName} is the strongest permitted option and the best value for this task.`,
    });
  }
  return out;
}
