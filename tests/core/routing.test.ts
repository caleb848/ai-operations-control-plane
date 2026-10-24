import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "@/core/governance/policy";
import { costFactor, latencyFactor, route } from "@/core/routing/engine";
import type { PriorityMode, TaskInput } from "@/core/types";
import { getScenario } from "@/scenarios/scenarios";
import { availability, FRESH_BUDGET, GEMMA, HAIKU, OPUS, QWEN, request, SONNET, ALL_MODELS } from "../support/fixtures";

function scenarioTask(id: string): TaskInput {
  const s = getScenario(id)!;
  return { instruction: s.instruction, context: s.context, declaredClassification: s.declaredClassification };
}

const statusOf = (d: ReturnType<typeof route>, id: string) => d.candidates.find((c) => c.modelId === id)!.status;
const isLocalId = (id: string | null) => ALL_MODELS.find((m) => m.id === id)?.local === true;

describe("factor scales", () => {
  it("cost factor is 100 at $0 and 0 at the reference cost", () => {
    expect(costFactor(0)).toBe(100);
    expect(costFactor(0.05)).toBe(0);
    expect(costFactor(0.2)).toBe(0);
    expect(costFactor(0.0002)).toBeGreaterThan(90);
  });
  it("latency factor loses 18 points per doubling after 1 s", () => {
    expect(latencyFactor(500)).toBe(100);
    expect(latencyFactor(2000)).toBeCloseTo(82);
    expect(latencyFactor(8000)).toBeCloseTo(46);
  });
});

describe("Scenario 1: confidential client brief", () => {
  const d = route(request(scenarioTask("confidential-client-brief"), "balanced"));

  it("classifies the brief as confidential", () => {
    expect(d.profile.classification).toBe("confidential");
    expect(d.profile.taskType).toBe("document_analysis");
  });
  it("blocks every cloud model by policy and selects a local model", () => {
    for (const id of [HAIKU, SONNET, OPUS]) expect(statusOf(d, id)).toBe("blocked_policy");
    expect(d.selectedModelId).toBe(GEMMA);
    expect(d.candidates.find((c) => c.modelId === GEMMA)!.cost.costUsd).toBe(0);
  });
  it("explains the decision in policy terms", () => {
    const codes = d.rationale.map((r) => r.code);
    expect(codes).toContain("transfer_restricted");
    expect(codes).toContain("local_ok");
    expect(codes).toContain("zero_api_cost");
    expect(codes).toContain("threshold_met");
  });
  it("never puts a policy-blocked model in the fallback chain", () => {
    for (const id of d.fallbackChain) expect(ALL_MODELS.find((m) => m.id === id)!.local).toBe(true);
  });
  it("still prefers local when cloud is explicitly permitted", () => {
    const permitted = route(
      request(scenarioTask("confidential-client-brief"), "best_quality", { permission: { granted: true, justification: "Client approved cloud processing in SOW §4" } }),
    );
    expect(statusOf(permitted, SONNET)).not.toBe("blocked_policy");
    expect(permitted.selectedModelId).toBe(GEMMA);
    expect(permitted.rationale.map((r) => r.code)).toContain("prefer_local");
  });
  it("ignores a permission without a justification", () => {
    const noReason = route(request(scenarioTask("confidential-client-brief"), "balanced", { permission: { granted: true, justification: "  " } }));
    expect(statusOf(noReason, SONNET)).toBe("blocked_policy");
  });
});

describe("Scenario 2: simple public summarization, by priority mode", () => {
  const task = scenarioTask("public-summary");
  const pick = (mode: PriorityMode) => route(request(task, mode)).selectedModelId;

  it("is public and low complexity", () => {
    const d = route(request(task, "balanced"));
    expect(d.profile.classification).toBe("public");
    expect(d.profile.complexity).toBe("low");
  });
  const isLocal = (id: string | null) => ALL_MODELS.find((m) => m.id === id)?.local === true;

  it("Lowest cost keeps it local when a local model clears the threshold", () => expect(isLocal(pick("lowest_cost"))).toBe(true));
  it("Privacy first keeps it local", () => expect(isLocal(pick("privacy_first"))).toBe(true));
  it("Fastest picks the economical cloud model", () => expect(pick("fastest")).toBe(HAIKU));
  it("Balanced picks Haiku: near-zero cost and seconds instead of tens of seconds", () => expect(pick("balanced")).toBe(HAIKU));
  it("Best quality picks the premium model", () => expect(pick("best_quality")).toBe(OPUS));
  it("Balanced keeps the same task local once it is internal data", () => {
    expect(isLocal(route(request({ ...task, declaredClassification: "internal" }, "balanced")).selectedModelId)).toBe(true);
  });
  it("right-sizes between local models: both clear a low bar, so the tie goes to the faster one", () => {
    const d = route(request(task, "lowest_cost"));
    expect(statusOf(d, GEMMA)).toBe("eligible");
    expect(d.selectedModelId).toBe(QWEN);
  });
  it("avoids a model swap: a resident Gemma beats a cold Qwen", () => {
    const d = route(request(task, "lowest_cost", { availability: availability({ warm: [GEMMA] }) }));
    expect(d.selectedModelId).toBe(GEMMA);
  });
});

describe("Scenario 3: complex strategic reasoning", () => {
  const d = route(request(scenarioTask("strategic-positioning"), "balanced"));

  it("is very high complexity strategic reasoning", () => {
    expect(d.profile.taskType).toBe("strategic_reasoning");
    expect(d.profile.complexity).toBe("very_high");
  });
  it("considers local models but marks them below the reasoning threshold", () => {
    expect(statusOf(d, GEMMA)).toBe("below_threshold");
    expect(statusOf(d, QWEN)).toBe("below_threshold");
    expect(statusOf(d, HAIKU)).toBe("below_threshold");
  });
  it("selects Sonnet over Opus in Balanced mode and says why", () => {
    expect(d.selectedModelId).toBe(SONNET);
    expect(statusOf(d, OPUS)).toBe("eligible");
    const headroom = d.rationale.find((r) => r.code === "headroom");
    expect(headroom?.message).toMatch(/Opus 5\.5 adds \+\d+ quality/);
    expect(d.rationale.map((r) => r.code)).toContain("cheaper_below_threshold");
  });
  it("selects Opus when the priority is Best quality", () => {
    expect(route(request(scenarioTask("strategic-positioning"), "best_quality")).selectedModelId).toBe(OPUS);
  });
});

describe("Scenario 4: provider failure readiness", () => {
  const d = route(request(scenarioTask("provider-failure"), "balanced"));
  it("routes to Haiku with a local model in the fallback chain", () => {
    expect(d.selectedModelId).toBe(HAIKU);
    expect(d.fallbackChain).toContain(GEMMA);
  });
});

describe("Scenario 5: budget guard", () => {
  const nearlySpent = { ...FRESH_BUDGET, sessionSimulatedUsd: 1.995, simulated: true };
  const d = route(request(scenarioTask("budget-exhausted"), "best_quality", { budget: nearlySpent }));

  it("triggers the guard and reroutes to a capable local model", () => {
    expect(d.budgetGuard?.triggered).toBe(true);
    expect(d.budgetGuard?.originalModelId).toBe(OPUS);
    expect(d.selectedModelId).toBe(GEMMA);
    expect(statusOf(d, OPUS)).toBe("over_budget");
  });
  it("reserves the worst case, not the expected cost", () => {
    const opus = d.candidates.find((c) => c.modelId === OPUS)!;
    expect(opus.cost.maxCostUsd).toBeGreaterThan(opus.cost.costUsd);
    expect(d.budgetGuard!.requiredUsd).toBeCloseTo(opus.cost.maxCostUsd);
  });
  it("without a local model, falls back to the cheapest capable cloud model that fits", () => {
    const d = route(request(scenarioTask("budget-exhausted"), "best_quality", { budget: nearlySpent, availability: availability({ ollama: false }) }));
    expect(d.budgetGuard?.reroutedToModelId).toBe(HAIKU);
  });
  it("blocks when the budget is fully spent and no capable local model is available", () => {
    const spent = { ...FRESH_BUDGET, sessionSimulatedUsd: 2 };
    const blocked = route(request(scenarioTask("budget-exhausted"), "best_quality", { budget: spent, availability: availability({ ollama: false }) }));
    expect(blocked.outcome).toBe("blocked");
    expect(blocked.block?.code).toBe("budget_exhausted");
  });
  it("enforces the lifetime cap even when the session has room", () => {
    const lifetime = { ...FRESH_BUDGET, lifetimeActualUsd: 10 };
    const d = route(request(scenarioTask("budget-exhausted"), "best_quality", { budget: lifetime }));
    expect(d.budgetGuard?.triggered).toBe(true);
    expect(isLocalId(d.selectedModelId)).toBe(true);
  });
  it("leaves cheap cloud calls alone when budget remains", () => {
    const ok = route(request(scenarioTask("budget-exhausted"), "best_quality"));
    expect(ok.budgetGuard).toBeNull();
    expect(ok.selectedModelId).toBe(OPUS);
  });
});

describe("Scenario 6: restricted data with Ollama offline", () => {
  const d = route(request(scenarioTask("restricted-local-offline"), "balanced", { availability: availability({ ollama: false }) }));

  it("classifies as restricted", () => expect(d.profile.classification).toBe("restricted"));
  it("blocks with the fail-closed message instead of falling back to cloud", () => {
    expect(d.outcome).toBe("blocked");
    expect(d.block?.code).toBe("local_required_unavailable");
    expect(d.block?.message).toBe("Local execution required by policy, but the approved local provider is unavailable.");
    expect(d.selectedModelId).toBeNull();
    expect(d.fallbackChain).toHaveLength(0);
    for (const id of [HAIKU, SONNET, OPUS]) expect(statusOf(d, id)).toBe("blocked_policy");
  });
  it("runs locally when Ollama is online", () => {
    const online = route(request(scenarioTask("restricted-local-offline"), "balanced"));
    expect(online.outcome).toBe("routed");
    expect(ALL_MODELS.find((m) => m.id === online.selectedModelId)!.local).toBe(true);
  });
  it("also fails closed with zero local models registered", () => {
    const none = route(
      request(scenarioTask("restricted-local-offline"), "balanced", { models: ALL_MODELS.filter((m) => !m.local) }),
    );
    expect(none.block?.code).toBe("local_required_unavailable");
  });
});

describe("gates", () => {
  it("routes public work to cloud when Ollama is offline", () => {
    const d = route(request(scenarioTask("public-summary"), "lowest_cost", { availability: availability({ ollama: false }) }));
    expect(d.selectedModelId).toBe(HAIKU);
    expect(statusOf(d, GEMMA)).toBe("unavailable");
  });
  it("respects disabled models", () => {
    const models = ALL_MODELS.map((m) => (m.id === GEMMA ? { ...m, enabled: false } : m));
    const d = route(request(scenarioTask("confidential-client-brief"), "balanced", { models }));
    expect(statusOf(d, GEMMA)).toBe("disabled");
    expect(d.selectedModelId).not.toBe(GEMMA);
  });
  it("blocks a model whose context window is too small", () => {
    const models = ALL_MODELS.map((m) => (m.local ? { ...m, contextWindowTokens: 600 } : m));
    const d = route(request(scenarioTask("confidential-client-brief"), "balanced", { models }));
    expect(statusOf(d, GEMMA)).toBe("context_exceeded");
    expect(d.outcome).toBe("blocked");
  });
  it("selects the best below-threshold model when nothing clears the bar, and says so", () => {
    const restrictedComplex: TaskInput = { ...scenarioTask("strategic-positioning"), declaredClassification: "restricted" };
    const d = route(request(restrictedComplex, "balanced"));
    expect(d.outcome).toBe("routed");
    expect(d.qualityThresholdMet).toBe(false);
    expect(d.rationale.map((r) => r.code)).toContain("threshold_missed");
  });
  it("orders candidates: selected first, blocked last", () => {
    const d = route(request(scenarioTask("confidential-client-brief"), "balanced"));
    expect(d.candidates[0].status).toBe("selected");
    expect(d.candidates.at(-1)!.status).toBe("blocked_policy");
  });
  it("is deterministic", () => {
    const a = route(request(scenarioTask("strategic-positioning"), "balanced"));
    const b = route(request(scenarioTask("strategic-positioning"), "balanced"));
    expect(a.candidates.map((c) => [c.modelId, c.routingScore])).toEqual(b.candidates.map((c) => [c.modelId, c.routingScore]));
  });
  it("cold starts lower a local model's latency estimate", () => {
    const warm = route(request(scenarioTask("public-summary"), "balanced", { availability: availability({ warm: [GEMMA] }) }));
    const cold = route(request(scenarioTask("public-summary"), "balanced", { availability: availability({ warm: [] }) }));
    const w = warm.candidates.find((c) => c.modelId === GEMMA)!;
    const c = cold.candidates.find((c) => c.modelId === GEMMA)!;
    expect(c.latency.totalMs - w.latency.totalMs).toBe(c.latency.coldStartMs);
    expect(c.factors.latency).toBeLessThan(w.factors.latency);
  });
  it("uses the policy passed in, not a global", () => {
    const strict = {
      ...DEFAULT_POLICY,
      rules: { ...DEFAULT_POLICY.rules, public: { ...DEFAULT_POLICY.rules.public, cloudAccess: "prohibited" as const } },
    };
    const d = route(request(scenarioTask("public-summary"), "fastest", { policy: strict }));
    expect(statusOf(d, HAIKU)).toBe("blocked_policy");
  });
});
