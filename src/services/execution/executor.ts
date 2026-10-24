import { createHash, randomBytes } from "node:crypto";
import { PORTFOLIO_EXECUTION_MESSAGE } from "@/config/deployment";
import type { AppConfig } from "@/config/env";
import { remainingBudget, checkBudget, type BudgetSnapshot } from "@/core/budget/budget";
import { classifyTask, COMPLEXITY_LABEL, taskTypeLabel } from "@/core/classification/classify";
import { evaluateOutput } from "@/core/evaluation/heuristic";
import { requiresLocal } from "@/core/governance/evaluate";
import { describeRule } from "@/core/governance/policy";
import { reviewRequirement } from "@/core/governance/review";
import { BASELINE_MODEL_ID } from "@/core/models/cloud-catalog";
import { apiCost, formatUsd } from "@/core/pricing/cost";
import { PRIORITY_LABEL } from "@/core/routing/config";
import { isRunnable, route } from "@/core/routing/engine";
import { CLASSIFICATION_LABEL } from "@/core/security/classification";
import { preview, redact, redactSecrets } from "@/core/security/redact";
import type {
  CandidateEvaluation,
  CloudPermission,
  ExecutionMode,
  ModelDescriptor,
  PriorityMode,
  ProviderId,
  RoutingDecision,
  SimulationOptions,
  TaskInput,
  TaskProfile,
} from "@/core/types";
import type { MockProvider } from "@/providers/mock/mock-provider";
import { isBuiltInScenarioTask } from "@/scenarios/scenarios";
import type { LocalRuntime } from "@/providers/ollama/ollama-provider";
import { ProviderError, type AIProvider, type AIRequest, type AIResponse } from "@/providers/types";
import type { ApprovalService } from "../approvals/approvals";
import type { BudgetLedger } from "../budget/ledger";
import { ResponseCache } from "../cache/response-cache";
import type { ExecutionRepository } from "../observability/repository";
import type { AttemptRecord, ExecutionRecord, ExecutionSource } from "../observability/types";
import type { ModelRegistry, RegistrySnapshot } from "../registry/model-registry";
import type { SettingsStore } from "../settings/settings-store";
import { TraceBuilder } from "./trace";

export const SYSTEM_PROMPT = `You are an assistant running inside an organization's AI operations platform.
Follow the instruction exactly and use only the supplied documents. If something the instruction asks for is not in the documents, say so briefly.
Do not repeat personal contact details (email addresses, phone numbers, ID numbers) unless the instruction explicitly asks for them.
Write in plain, professional English. Use Markdown only for lists, bold labels and simple tables.`;

/** Raised when a request asks for something the deployment forbids (e.g. paid execution in portfolio mode). */
export class DeploymentRestrictionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploymentRestrictionError";
  }
}

/** Never more than this many model attempts per request; the same model is never retried. */
export const MAX_ATTEMPTS = 3;

export function buildPrompt(task: TaskInput): string {
  const instruction = task.instruction.trim();
  return task.context?.trim() ? `${instruction}\n\n<documents>\n${task.context.trim()}\n</documents>` : instruction;
}

/** Request title: the first sentence, cut at a word boundary with an ellipsis when long. */
export function shortTitle(text: string, max = 110): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const atWord = cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6));
  return `${atWord.replace(/[\s,;:–-]+$/, "")}…`;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
}

const PROVIDER_LABEL: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI", google: "Google Gemini", ollama: "Ollama" };

const secs = (ms: number) => (ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`);

export interface ExecuteRequest {
  task: TaskInput;
  priorityMode: PriorityMode;
  source: ExecutionSource;
  permission?: CloudPermission;
  simulation?: SimulationOptions;
  scenarioId?: string;
  /** Comparison Lab: run exactly this model (still gated by policy, availability and budget). */
  pinModelId?: string;
  /** The caller confirmed that paid execution is acceptable for this request. */
  allowLive?: boolean;
  /**
   * Worst-case cost the caller confirmed. Paid attempts above it (for example a
   * pricier fallback) are refused. Defaults to the first model's worst case.
   */
  maxLiveCostUsd?: number;
}

export interface PlanResult {
  decision: RoutingDecision;
  profile: TaskProfile;
  snapshot: RegistrySnapshot;
  budget: BudgetSnapshot;
  trace: TraceBuilder;
  startedMs: number;
  prompt: string;
}

export interface ExecutorDeps {
  config: AppConfig;
  registry: ModelRegistry;
  ollama: LocalRuntime;
  mock: MockProvider;
  cloud: Partial<Record<Exclude<ProviderId, "ollama" | "mock">, AIProvider>>;
  executions: ExecutionRepository;
  approvals: ApprovalService;
  ledger: BudgetLedger;
  settings: SettingsStore;
  cache: ResponseCache;
}

interface AttemptOutcome {
  response: AIResponse;
  mode: ExecutionMode;
  cached: boolean;
  cachedCostUsd: number;
  /** Actual paid cost, already settled into the ledger. */
  chargedUsd: number;
}

export class Executor {
  constructor(private readonly d: ExecutorDeps) {}

  /** Classify → availability → governance → route → budget. No model is called. */
  async plan(req: ExecuteRequest): Promise<PlanResult> {
    const startedMs = Date.now();
    const trace = new TraceBuilder(startedMs);
    const policy = this.d.settings.policy();
    const sim = req.simulation ?? {};

    trace.add("request", "info", "Request received", `source: ${req.source}${req.scenarioId ? ` · scenario: ${req.scenarioId}` : ""} · priority: ${PRIORITY_LABEL[req.priorityMode]}`);
    const simNotes = [
      sim.ollamaOffline ? "Ollama forced offline" : null,
      sim.providerOutage?.length ? `${sim.providerOutage.map((p) => PROVIDER_LABEL[p] ?? p).join(", ")} outage injected` : null,
      sim.sessionSpendUsd !== undefined ? `session spend set to ${formatUsd(sim.sessionSpendUsd)}` : null,
    ].filter(Boolean);
    if (simNotes.length) trace.add("request", "warn", "Scenario simulation active", simNotes.join(" · "), true);

    const profile = classifyTask(req.task);
    trace.add("classify", "info", `Task classified: ${taskTypeLabel(profile.taskType)}`, profile.taskTypeSignals.join(", "));
    trace.add("classify", "info", `Complexity: ${COMPLEXITY_LABEL[profile.complexity]} (score ${profile.complexityScore})`, profile.complexitySignals.join(", "));
    const sensitive = profile.classification === "confidential" || profile.classification === "restricted";
    trace.add(
      "classify",
      sensitive ? "warn" : "info",
      `Sensitivity: ${CLASSIFICATION_LABEL[profile.classification]}`,
      [profile.classificationReason, ...profile.findings.map((f) => `${f.label}${f.count > 1 ? ` ×${f.count}` : ""}`)].join(" · "),
    );
    trace.add("classify", "info", `Business risk: ${profile.businessRisk}`, profile.riskSignals.join(", "));

    const snapshot = await this.d.registry.snapshot(sim);
    const o = snapshot.ollama;
    if (o.simulatedOffline) {
      trace.add("availability", "warn", "Ollama availability checked: Offline", "Forced offline by scenario simulation", true);
    } else if (o.status === "simulated") {
      trace.add("availability", "info", "Ollama: not contacted (portfolio demo)", o.detail, true);
    } else {
      trace.add(
        "availability",
        o.status === "online" ? "success" : "warn",
        `Ollama availability checked: ${o.status === "online" ? "Online" : "Offline"}`,
        o.status === "online"
          ? `${o.detail} · ${o.installed} model(s) installed · ${o.running.length ? `resident: ${o.running.map((r) => r.name).join(", ")}` : "none resident"}`
          : o.detail,
      );
    }
    trace.add("availability", "info", `Cloud backend: ${snapshot.cloudLive ? "LIVE API" : "DEMO (MockProvider, no API calls)"}`);

    const permissionActive = Boolean(req.permission?.granted && req.permission.justification?.trim());
    const localOnly = requiresLocal(policy, profile.classification, req.permission);
    trace.add("governance", "info", `Policy ${CLASSIFICATION_LABEL[profile.classification].toUpperCase()}: ${describeRule(policy, profile.classification)}`);
    trace.add(
      "governance",
      localOnly ? "block" : permissionActive && policy.rules[profile.classification].cloudAccess === "explicit_permission" ? "warn" : "success",
      `Cloud access: ${localOnly ? "Restricted" : permissionActive && policy.rules[profile.classification].cloudAccess === "explicit_permission" ? "Permitted under explicit exception" : "Permitted"}`,
      permissionActive ? `Justification: ${req.permission!.justification}` : undefined,
    );

    let budget: BudgetSnapshot = this.d.ledger.snapshot();
    if (sim.sessionSpendUsd !== undefined) {
      budget = { ...budget, sessionActualUsd: 0, sessionSimulatedUsd: sim.sessionSpendUsd, simulated: true };
      trace.add("budget", "warn", `Session spend: ${formatUsd(sim.sessionSpendUsd)} of ${formatUsd(budget.sessionBudgetUsd)}`, "Set by scenario simulation", true);
    }

    const baselineModel = snapshot.models.find((m) => m.id === BASELINE_MODEL_ID);
    const decision = route({
      profile,
      models: snapshot.models,
      availability: snapshot.availability,
      policy,
      priorityMode: req.priorityMode,
      budget,
      permission: req.permission,
      costLimits: { liveMaxOutputTokens: this.d.config.liveMaxOutputTokens, localMaxOutputTokens: this.d.config.ollama.maxOutputTokens },
      baselineModel,
    });

    const s = decision.summary;
    trace.add(
      "routing",
      "info",
      `${s.considered} models considered`,
      `${s.eligible} permitted by policy · ${s.blockedByPolicy} blocked by policy · ${s.belowThreshold} below threshold · ${s.unavailable} unavailable`,
    );
    for (const c of decision.candidates.filter((c) => c.location === "local")) {
      if (c.status === "selected" || c.status === "eligible") trace.add("routing", "success", `Local model eligible: ${c.shortName}`, `quality ${Math.round(c.quality.score)} ≥ ${c.quality.required} · score ${Math.round(c.routingScore ?? 0)}`);
      else if (c.status === "below_threshold") trace.add("routing", "warn", `Local model below threshold: ${c.shortName}`, `quality ${Math.round(c.quality.score)} < ${c.quality.required}`);
      else if (c.status === "unavailable") trace.add("routing", "block", `Local model unavailable: ${c.shortName}`, c.reasons.find((r) => r.code === "unavailable")?.message);
    }
    const blockedCloud = decision.candidates.filter((c) => c.location === "cloud" && c.status === "blocked_policy");
    if (blockedCloud.length) {
      trace.add("routing", "block", `Cloud models blocked by policy: ${blockedCloud.map((c) => c.shortName).join(", ")}`, blockedCloud[0].reasons.find((r) => r.severity === "block")?.message);
    }
    if (decision.budgetGuard) {
      trace.add("budget", decision.budgetGuard.reroutedToModelId ? "warn" : "block", decision.budgetGuard.reroutedToModelId ? "Budget Guard triggered" : "Budget exhausted", decision.budgetGuard.message, budget.simulated);
    }
    const selected = decision.candidates.find((c) => c.modelId === decision.selectedModelId);
    if (selected) {
      trace.add("routing", "success", `Selected: ${selected.shortName} (${selected.location})`, `${PRIORITY_LABEL[req.priorityMode]} score ${Math.round(selected.routingScore ?? 0)} · quality ${Math.round(selected.quality.score)}/${selected.quality.required}`);
      trace.add(
        "routing",
        "info",
        selected.location === "local" ? "External API cost: $0.00" : `Estimated external API cost: ${formatUsd(selected.cost.costUsd)}`,
        selected.location === "local" ? "Local compute only" : `worst case ${formatUsd(selected.cost.maxCostUsd)} at max_tokens ${selected.cost.maxOutputTokens}`,
      );
      if (decision.fallbackChain.length) {
        const names = decision.fallbackChain.map((id) => decision.candidates.find((c) => c.modelId === id)?.shortName ?? id);
        trace.add("routing", "info", "Fallback chain prepared", names.join(" → "));
      }
    } else if (decision.block) {
      trace.add("routing", "block", decision.block.message);
      if (localOnly) trace.add("governance", "block", "Fail-closed: data was not sent to any cloud provider");
    }

    return { decision, profile, snapshot, budget, trace, startedMs, prompt: buildPrompt(req.task) };
  }

  async execute(req: ExecuteRequest): Promise<ExecutionRecord> {
    // Second line of defense behind the API: a deployment without paid inference refuses paid requests outright.
    if (!this.d.config.deployment.liveCloudInference && (req.allowLive || req.maxLiveCostUsd !== undefined)) {
      throw new DeploymentRestrictionError(PORTFOLIO_EXECUTION_MESSAGE);
    }
    const plan = await this.plan(req);
    const { decision, profile, snapshot, trace } = plan;
    const id = newId("exe");
    const createdAt = new Date(plan.startedMs).toISOString();
    const session = this.d.ledger.currentSession();
    const policy = this.d.settings.policy();

    const base = this.baseRecord(id, createdAt, session.id, req, plan);
    // Public demo: history is shared by every visitor, so only unedited built-in scenarios are added to it.
    // Anything a visitor typed is returned to them alone, never shown to anyone else.
    const shared = !this.d.config.deployment.publicDeployment || isBuiltInScenarioTask(req.task);
    if (!shared) trace.add("request", "info", "Kept private to this browser", "Custom text isn't added to the shared demo history or review queue");

    // Which models to try.
    let chain: string[];
    if (req.pinModelId) {
      const pinned = decision.candidates.find((c) => c.modelId === req.pinModelId);
      const runnable = pinned && isRunnable(pinned.status);
      if (!pinned || !runnable) {
        const why = pinned?.reasons.find((r) => r.severity === "block")?.message ?? "Model not registered";
        trace.add("routing", "block", `Not executed on ${pinned?.shortName ?? req.pinModelId}`, why);
        return this.persist({ ...base, status: "blocked", error: why, trace: trace.events }, shared);
      }
      chain = [pinned.modelId];
      trace.add("routing", "info", `Comparison Lab: pinned to ${pinned.shortName}`, "Routing selection shown for reference; fallback disabled for pinned runs");
    } else {
      if (decision.outcome === "blocked" || !decision.selectedModelId) {
        trace.add("complete", "block", "Request blocked; no model was called", decision.block?.message);
        return this.persist({ ...base, status: "blocked", error: decision.block?.message ?? "Blocked", trace: trace.events }, shared);
      }
      chain = [decision.selectedModelId, ...decision.fallbackChain];
    }

    const attempts: AttemptRecord[] = [];
    const skipProviders = new Set<string>();
    const firstCandidate = decision.candidates.find((c) => c.modelId === chain[0]);
    const liveCeiling = req.maxLiveCostUsd ?? firstCandidate?.cost.maxCostUsd ?? 0;
    let counted = 0;
    let success: { model: ModelDescriptor; candidate: CandidateEvaluation; outcome: AttemptOutcome } | null = null;

    for (const modelId of chain) {
      if (counted >= MAX_ATTEMPTS) {
        trace.add("fallback", "warn", `Attempt limit reached (${MAX_ATTEMPTS})`, "No further fallbacks");
        break;
      }
      const model = snapshot.models.find((m) => m.id === modelId);
      const candidate = decision.candidates.find((c) => c.modelId === modelId);
      if (!model || !candidate) continue;
      if (skipProviders.has(model.providerId)) continue;

      if (attempts.length > 0) {
        trace.add(
          "fallback",
          "warn",
          `Fallback → ${model.shortName} (${model.location})`,
          `Next in the pre-approved chain · policy permits ${model.location} execution for ${CLASSIFICATION_LABEL[profile.classification].toUpperCase()} data`,
        );
      }

      const started = Date.now();
      try {
        const outcome = await this.attempt(model, candidate, req, plan, trace, id, liveCeiling);
        counted++;
        attempts.push({ modelId, providerId: model.providerId, mode: outcome.mode, ok: true, latencyMs: Date.now() - started });
        success = { model, candidate, outcome };
        break;
      } catch (err) {
        const e = err instanceof ProviderError ? err : new ProviderError("unknown", err instanceof Error ? err.message : String(err), { scope: "model", fallbackEligible: true });
        const simulated = Boolean(e.opts.simulated);
        if (!e.opts.preflight) counted++;
        attempts.push({
          modelId,
          providerId: model.providerId,
          mode: model.local ? "local" : this.d.config.cloudLive ? "live" : "demo",
          ok: false,
          latencyMs: Date.now() - started,
          error: { code: e.code, message: e.message, simulated },
        });
        trace.add(e.opts.preflight ? "fallback" : "execution", e.opts.preflight ? "warn" : "error", `${model.shortName} ${e.opts.preflight ? "skipped" : "failed"}: ${e.message}`, `error: ${e.code}${e.opts.status ? ` · HTTP ${e.opts.status}` : ""}${simulated ? " · injected by scenario" : ""}`, simulated);
        if (!e.opts.fallbackEligible) {
          trace.add("fallback", "block", "Not retried", "This error would repeat on any model (request-level failure)");
          break;
        }
        if (e.opts.scope === "provider") {
          const siblings = chain
            .map((id) => snapshot.models.find((m) => m.id === id))
            .filter((m): m is ModelDescriptor => Boolean(m) && m!.providerId === model.providerId && m!.id !== model.id);
          skipProviders.add(model.providerId);
          if (siblings.length) {
            trace.add("fallback", "warn", `Provider-level failure: skipping other ${PROVIDER_LABEL[model.providerId] ?? model.providerId} models`, siblings.map((m) => m.shortName).join(", "));
          }
        }
      }
    }

    if (!success) {
      const localOnly = requiresLocal(policy, profile.classification, req.permission);
      trace.add("complete", "error", "All permitted models failed; request not completed", localOnly ? "Fail-closed: no cloud fallback is permitted for this classification" : undefined);
      return this.persist({ ...base, status: "failed", attempts, error: attempts.at(-1)?.error?.message ?? "Execution failed", trace: trace.events }, shared);
    }

    const { model, candidate, outcome } = success;
    const r = outcome.response;
    const simulated = outcome.mode === "demo";
    const inputTokens = simulated ? candidate.cost.inputTokens : r.usage.inputTokens;
    const outputTokens = simulated ? candidate.cost.outputTokens : r.usage.outputTokens;
    const reasoningTokens = simulated ? candidate.cost.reasoningTokens : r.usage.reasoningTokens;
    const externalCostUsd = outcome.chargedUsd;
    const simulatedCostUsd = simulated ? candidate.cost.costUsd : 0;
    const baselineModel = snapshot.models.find((m) => m.id === BASELINE_MODEL_ID);
    const baselineCostUsd = baselineModel ? apiCost(baselineModel.pricing, inputTokens, outputTokens) : 0;

    if (simulatedCostUsd > 0 && !plan.budget.simulated) {
      this.d.ledger.charge({ executionId: id, modelId: model.id, kind: "simulated", amountUsd: simulatedCostUsd, inputTokens, outputTokens });
    }

    // Only real model text is evaluated (live, local, or a recorded local output); placeholder text would yield meaningless scores.
    const evaluable = !r.simulated || Boolean(r.recorded);
    const evaluation = evaluable ? evaluateOutput({ instruction: req.task.instruction, context: req.task.context, output: r.text, profile, stopReason: r.stopReason }) : null;
    if (evaluation) {
      trace.add(
        "evaluation",
        evaluation.score >= policy.humanReview.minEvaluationScore ? "success" : "warn",
        `Evaluation completed: ${evaluation.score}/100`,
        `heuristic estimate${r.recorded ? " of the recorded output" : ""} · ${evaluation.checks.length} checks · ${evaluation.checks.filter((c) => !c.passed).map((c) => c.label.toLowerCase()).join(", ") || "all passed"}`,
        simulated,
      );
    } else {
      trace.add("evaluation", "info", "Evaluation skipped", "simulated output: there is no real model text to evaluate", true);
    }

    const fallbackUsed = attempts.length > 1;
    const permissionUsed = Boolean(req.permission?.granted) && model.location === "cloud" && policy.rules[profile.classification].cloudAccess === "explicit_permission";
    const thresholdMet = req.pinModelId ? candidate.quality.meets : decision.qualityThresholdMet;
    const review = reviewRequirement({ profile, policy, evaluation, qualityThresholdMet: thresholdMet, fallbackUsed, cloudPermissionUsed: permissionUsed });
    trace.add(
      "review",
      review.required ? "warn" : "success",
      review.required ? "Human review required" : "No human review required",
      review.reasons.map((x) => x.message).join(" · ") || undefined,
    );

    const totalMs = Date.now() - plan.startedMs;
    trace.add(
      "complete",
      "success",
      `Completed in ${secs(totalMs)}`,
      `${model.shortName} · ${outcome.mode.toUpperCase()} · external API cost ${formatUsd(externalCostUsd)}${simulated ? ` · simulated cost ${formatUsd(simulatedCostUsd)}` : ""}`,
    );

    const rec: ExecutionRecord = {
      ...base,
      status: "completed",
      mode: outcome.mode,
      location: model.location,
      executedModelId: model.id,
      executedProvider: model.providerId,
      fallbackUsed,
      inputTokens,
      outputTokens,
      reasoningTokens,
      tokenSource: simulated ? "estimated" : r.usage.source,
      externalCostUsd,
      simulatedCostUsd,
      baselineCostUsd,
      latencyMs: simulated ? (r.recorded?.latencyMs ?? candidate.latency.totalMs) : r.latencyMs,
      latencySource: simulated ? (r.recorded ? "recorded" : "estimated") : "measured",
      outputTps: r.timings?.outputTokensPerSec ?? null,
      prefillTps: r.timings?.promptTokensPerSec && r.usage.inputTokens >= 300 ? r.timings.promptTokensPerSec : null,
      loadMs: r.timings?.loadMs ?? null,
      evalScore: evaluation?.score ?? null,
      reviewRequired: review.required,
      reviewStatus: review.required ? "pending" : "not_required",
      outputText: redactSecrets(r.text),
      evaluation,
      review,
      attempts,
      trace: trace.events,
    };
    this.persist(rec, shared);
    if (review.required && shared) this.d.approvals.create(id, review.reasons, createdAt);
    return rec;
  }

  private async attempt(
    model: ModelDescriptor,
    candidate: CandidateEvaluation,
    req: ExecuteRequest,
    plan: PlanResult,
    trace: TraceBuilder,
    executionId: string,
    liveCeiling: number,
  ): Promise<AttemptOutcome> {
    const sim = req.simulation ?? {};
    const vendor = PROVIDER_LABEL[model.providerId] ?? model.providerId;
    const request: AIRequest = {
      model: model.providerModelId,
      system: SYSTEM_PROMPT,
      prompt: plan.prompt,
      maxOutputTokens: candidate.cost.maxOutputTokens,
      effort: candidate.cost.effort,
      simulation: { scenarioId: req.scenarioId, taskType: plan.profile.taskType, registryModelId: model.id, latencyMs: candidate.latency.totalMs },
    };

    if (model.local && !this.d.config.deployment.localInference) {
      trace.add(
        "execution",
        "info",
        "Simulated local inference (portfolio demo)",
        `On a local installation this request would execute through Ollama (${model.providerModelId}) on the developer's machine`,
        true,
      );
      const response = await this.d.mock.execute(request);
      trace.add(
        "execution",
        "success",
        response.recorded ? "Recorded local output replayed" : "Simulated response returned",
        response.recorded
          ? `${response.recorded.modelName} produced this text for this exact prompt on ${response.recorded.machine} (${secs(response.recorded.latencyMs)})`
          : `estimated ${secs(candidate.latency.totalMs)} on the developer's machine · external API cost $0.00`,
        true,
      );
      return { response, mode: "demo", cached: false, cachedCostUsd: 0, chargedUsd: 0 };
    }

    if (model.local) {
      trace.add("execution", "info", "Local inference started", `Ollama · ${model.providerModelId} · num_ctx ${this.d.config.ollama.numCtx} · thinking off · max ${request.maxOutputTokens} tokens`);
      const response = await this.d.ollama.execute(request);
      const t = response.timings;
      trace.add(
        "execution",
        "success",
        "Response received",
        `${response.usage.outputTokens} tokens${t?.outputTokensPerSec ? ` at ${t.outputTokensPerSec} tok/s` : ""} · prompt ${response.usage.inputTokens} tokens${t?.loadMs && t.loadMs > 500 ? ` · model load ${secs(t.loadMs)}` : ""}`,
      );
      trace.add("execution", "info", `Latency: ${secs(response.latencyMs)}`, "measured on this device");
      return { response, mode: "local", cached: false, cachedCostUsd: 0, chargedUsd: 0 };
    }

    if (sim.providerOutage?.includes(model.providerId)) {
      trace.add("execution", "info", `${this.d.config.cloudLive ? "Live API call" : "Simulated execution"} started`, `${vendor} · ${model.providerModelId}`);
      throw new ProviderError("unavailable", `${vendor} API returned 503 Service Unavailable`, { scope: "provider", fallbackEligible: true, status: 503, simulated: true });
    }

    if (!this.d.config.cloudLive) {
      trace.add("execution", "info", "Simulated execution started (MockProvider)", `${model.shortName} is not called in DEMO mode`, true);
      const response = await this.d.mock.execute(request);
      trace.add("execution", "success", "Simulated response returned", `estimated ${secs(candidate.latency.totalMs)} · estimated cost ${formatUsd(candidate.cost.costUsd)} (not charged)`, true);
      return { response, mode: "demo", cached: false, cachedCostUsd: 0, chargedUsd: 0 };
    }

    if (!req.allowLive) {
      throw new ProviderError("live_disabled", "Paid execution was not confirmed for this request", { scope: "provider", fallbackEligible: true, preflight: true });
    }
    if (candidate.cost.maxCostUsd > liveCeiling + 1e-9) {
      throw new ProviderError("budget", `Worst case ${formatUsd(candidate.cost.maxCostUsd)} exceeds the confirmed ${formatUsd(liveCeiling)}`, {
        scope: "model",
        fallbackEligible: true,
        preflight: true,
      });
    }
    const provider = this.d.cloud[model.providerId as keyof ExecutorDeps["cloud"]];
    if (!provider) throw new ProviderError("not_configured", `${vendor} provider is not configured`, { scope: "provider", fallbackEligible: true, preflight: true });

    const key = ResponseCache.key({ modelId: model.id, system: request.system, prompt: request.prompt, maxOutputTokens: request.maxOutputTokens, effort: request.effort });
    const hit = this.d.cache.get(key);
    if (hit) {
      const cost = apiCost(model.pricing, hit.usage.inputTokens, hit.usage.outputTokens);
      trace.add("execution", "success", "Served from response cache", `identical request already paid for (${formatUsd(cost)}); this run costs $0.00`);
      return { response: hit, mode: "live", cached: true, cachedCostUsd: cost, chargedUsd: 0 };
    }

    // Check and reserve with no await in between: concurrent requests can't both pass.
    const check = checkBudget(this.d.ledger.snapshot(), candidate.cost.maxCostUsd);
    if (!check.allowed) throw new ProviderError("budget", check.message, { scope: "provider", fallbackEligible: true, preflight: true });
    const reservation = this.d.ledger.reserve({ executionId, modelId: model.id, amountUsd: candidate.cost.maxCostUsd });
    trace.add(
      "execution",
      "info",
      "Live API call started",
      `${vendor} · ${model.providerModelId} · max_tokens ${request.maxOutputTokens}${request.effort ? ` · effort ${request.effort}` : ""} · ${formatUsd(check.requiredUsd)} reserved of ${formatUsd(check.remainingUsd)}`,
    );
    let response: AIResponse;
    try {
      response = await provider.execute(request);
    } catch (err) {
      // Timeouts and unknown failures may still be billed: keep the worst case counted.
      const code = err instanceof ProviderError ? err.code : "unknown";
      if (code === "timeout" || code === "unknown") this.d.ledger.keepUnreconciled(reservation);
      else this.d.ledger.release(reservation);
      throw err;
    }
    const cost = apiCost(model.pricing, response.usage.inputTokens, response.usage.outputTokens);
    this.d.ledger.settle(reservation, cost, { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens });
    try {
      this.d.cache.put(key, model.id, { ...response, text: redactSecrets(response.text) }, cost);
    } catch {
      /* cache is an optimization; the charge is already recorded */
    }
    trace.add(
      "execution",
      "success",
      "Response received",
      `${response.usage.inputTokens} in / ${response.usage.outputTokens} out tokens${response.usage.reasoningTokens ? ` (${response.usage.reasoningTokens} reasoning)` : ""} · actual cost ${formatUsd(cost)}`,
    );
    trace.add("execution", "info", `Latency: ${secs(response.latencyMs)}`, "measured");
    return { response, mode: "live", cached: false, cachedCostUsd: 0, chargedUsd: cost };
  }

  private baseRecord(id: string, createdAt: string, sessionId: string, req: ExecuteRequest, plan: PlanResult): ExecutionRecord {
    const { decision, profile } = plan;
    const selected = decision.candidates.find((c) => c.modelId === decision.selectedModelId);
    const firstSentence = req.task.instruction.trim().split(/(?<=[.!?])\s/)[0] ?? req.task.instruction;
    return {
      id,
      createdAt,
      source: req.source,
      scenarioId: req.scenarioId ?? null,
      sessionId,
      status: "blocked",
      mode: null,
      location: null,
      taskType: profile.taskType,
      complexity: profile.complexity,
      classification: profile.classification,
      businessRisk: profile.businessRisk,
      priorityMode: req.priorityMode,
      selectedModelId: decision.selectedModelId,
      executedModelId: null,
      executedProvider: null,
      fallbackUsed: false,
      budgetGuard: Boolean(decision.budgetGuard?.triggered),
      policyBlocks: decision.summary.blockedByPolicy,
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      tokenSource: null,
      externalCostUsd: 0,
      simulatedCostUsd: 0,
      estimatedCostUsd: selected?.cost.costUsd ?? 0,
      baselineCostUsd: 0,
      latencyMs: null,
      latencySource: null,
      outputTps: null,
      prefillTps: null,
      loadMs: null,
      evalScore: null,
      reviewRequired: false,
      reviewStatus: "not_required",
      title: shortTitle(redact(firstSentence)),
      inputPreview: preview(plan.prompt, 280),
      inputSha256: createHash("sha256").update(plan.prompt).digest("hex"),
      outputText: null,
      error: null,
      decision,
      evaluation: null,
      review: null,
      attempts: [],
      trace: [],
    };
  }

  private persist(rec: ExecutionRecord, shared: boolean): ExecutionRecord {
    if (shared) this.d.executions.insert(rec);
    return rec;
  }

  /** Remaining budget, for API responses. */
  budgetView() {
    const b = this.d.ledger.snapshot();
    return { ...b, ...remainingBudget(b) };
  }
}
