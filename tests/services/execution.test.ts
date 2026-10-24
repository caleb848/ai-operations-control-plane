import { describe, expect, it } from "vitest";
import { getScenario, SCENARIOS } from "@/scenarios/scenarios";
import { seedDemoWorkload } from "@/services/seed/demo-workload";
import type { ExecuteRequest } from "@/services/execution/executor";
import { DEFAULT_POLICY } from "@/core/governance/policy";
import { buildHarness } from "../support/harness";
import { ALL_MODELS } from "../support/fixtures";

function scenarioRequest(id: string, extra: Partial<ExecuteRequest> = {}): ExecuteRequest {
  const s = getScenario(id)!;
  return {
    task: { instruction: s.instruction, context: s.context, declaredClassification: s.declaredClassification },
    priorityMode: s.priorityMode,
    simulation: s.simulation,
    scenarioId: s.id,
    source: "scenario",
    ...extra,
  };
}

const chatCalls = (h: ReturnType<typeof buildHarness>) => h.ollamaFetch.calls.filter((c) => c.path === "/api/chat");

describe("execution service: demo mode", () => {
  it("Scenario 1 runs locally for real, costs $0 and queues human review", async () => {
    const h = buildHarness();
    const rec = await h.executor.execute(scenarioRequest("confidential-client-brief"));
    expect(rec.status).toBe("completed");
    expect(rec.mode).toBe("local");
    expect(rec.executedModelId).toBe("ollama:gemma4:12b-it-qat");
    expect(rec.externalCostUsd).toBe(0);
    expect(rec.tokenSource).toBe("provider");
    expect(rec.latencySource).toBe("measured");
    expect(rec.outputTps).toBe(16);
    expect(chatCalls(h)).toHaveLength(1);
    expect(h.mockCalls).toHaveLength(0);
    expect(rec.reviewStatus).toBe("pending");
    expect(h.approvals.pendingCount()).toBe(1);
    const messages = rec.trace.map((e) => e.message);
    expect(messages).toContain("Sensitivity: Confidential");
    expect(messages).toContain("Cloud access: Restricted");
    expect(messages).toContain("Ollama availability checked: Online");
    expect(messages).toContain("Local model eligible: Gemma 4 12B");
    expect(messages).toContain("External API cost: $0.00");
    expect(messages).toContain("Local inference started");
    expect(messages).toContain("Human review required");
  });

  it("stores a fingerprint and redacted preview, never raw contact details", async () => {
    const h = buildHarness();
    const rec = await h.executor.execute(scenarioRequest("confidential-client-brief"));
    const stored = h.executions.get(rec.id)!;
    expect(stored.inputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.inputPreview).not.toContain("dana.whitfield@corvane-dental.example");
    expect(JSON.stringify(stored.trace)).not.toContain("dana.whitfield@");
  });

  it("serves cloud-routed work from MockProvider in demo mode and labels it", async () => {
    const h = buildHarness();
    const rec = await h.executor.execute(scenarioRequest("public-summary"));
    expect(rec.executedModelId).toBe("anthropic:claude-haiku-5-5");
    expect(rec.mode).toBe("demo");
    expect(rec.externalCostUsd).toBe(0);
    expect(rec.simulatedCostUsd).toBeGreaterThan(0);
    expect(rec.tokenSource).toBe("estimated");
    expect(rec.latencySource).toBe("estimated");
    expect(h.cloud.calls).toHaveLength(0);
    expect(rec.trace.some((e) => e.simulated && e.message.startsWith("Simulated execution started"))).toBe(true);
    expect(h.ledger.snapshot().sessionSimulatedUsd).toBeCloseTo(rec.simulatedCostUsd);
    expect(h.ledger.snapshot().sessionActualUsd).toBe(0);
  });

  it("Scenario 4: a provider outage falls back to local and the trace records it", async () => {
    const h = buildHarness();
    const rec = await h.executor.execute(scenarioRequest("provider-failure"));
    expect(rec.status).toBe("completed");
    expect(rec.selectedModelId).toBe("anthropic:claude-haiku-5-5");
    expect(rec.executedModelId?.startsWith("ollama:")).toBe(true);
    expect(rec.fallbackUsed).toBe(true);
    expect(rec.attempts.map((a) => a.ok)).toEqual([false, true]);
    expect(rec.attempts[0].error).toMatchObject({ code: "unavailable", simulated: true });
    const messages = rec.trace.map((e) => e.message);
    expect(messages.some((m) => m.startsWith("Haiku 5.5 failed"))).toBe(true);
    expect(messages).toContain("Provider-level failure: skipping other Anthropic models");
    expect(messages.some((m) => m.startsWith("Fallback → "))).toBe(true);
    // Never retried the same model, never called the paid provider.
    expect(new Set(rec.attempts.map((a) => a.modelId)).size).toBe(rec.attempts.length);
    expect(h.cloud.calls).toHaveLength(0);
  });

  it("Scenario 5: the budget guard reroutes to a capable local model", async () => {
    const h = buildHarness();
    const rec = await h.executor.execute(scenarioRequest("budget-exhausted"));
    expect(rec.budgetGuard).toBe(true);
    expect(rec.decision.budgetGuard?.originalModelId).toBe("anthropic:claude-opus-5-5");
    expect(rec.mode).toBe("local");
    expect(rec.trace.map((e) => e.message)).toContain("Budget Guard triggered");
    // The simulated session spend is scenario-only; the real ledger is untouched.
    expect(h.ledger.snapshot().sessionSimulatedUsd).toBe(0);
  });

  it("Scenario 6: restricted data with Ollama offline is blocked and nothing is sent anywhere", async () => {
    const h = buildHarness();
    const rec = await h.executor.execute(scenarioRequest("restricted-local-offline"));
    expect(rec.status).toBe("blocked");
    expect(rec.error).toBe("Local execution required by policy, but the approved local provider is unavailable.");
    expect(chatCalls(h)).toHaveLength(0);
    expect(h.mockCalls).toHaveLength(0);
    expect(h.cloud.calls).toHaveLength(0);
    expect(rec.trace.map((e) => e.message)).toContain("Fail-closed: data was not sent to any cloud provider");
  });

  it("does not fall back to cloud when a restricted request's local run fails", async () => {
    const h = buildHarness({ ollama: { failChat: true } });
    const rec = await h.executor.execute(scenarioRequest("restricted-local-offline", { simulation: undefined }));
    expect(rec.status).toBe("failed");
    expect(rec.attempts.every((a) => a.providerId === "ollama")).toBe(true);
    expect(h.mockCalls).toHaveLength(0);
    expect(h.cloud.calls).toHaveLength(0);
  });

  it("handles a real Ollama outage gracefully for public work by routing to cloud", async () => {
    const h = buildHarness({ ollama: { online: false } });
    const rec = await h.executor.execute(scenarioRequest("public-summary", { priorityMode: "lowest_cost" }));
    expect(rec.status).toBe("completed");
    expect(rec.location).toBe("cloud");
    expect(rec.trace.map((e) => e.message)).toContain("Ollama availability checked: Offline");
  });

  it("caps attempts and never retries a model", async () => {
    const h = buildHarness({ ollama: { failChat: true } });
    const rec = await h.executor.execute(scenarioRequest("public-summary", { priorityMode: "lowest_cost", simulation: { providerOutage: ["anthropic"] } }));
    expect(rec.status).toBe("failed");
    expect(rec.attempts.length).toBeLessThanOrEqual(3);
    expect(new Set(rec.attempts.map((a) => a.modelId)).size).toBe(rec.attempts.length);
  });

  it("pinned Comparison Lab runs refuse policy-blocked models", async () => {
    const h = buildHarness();
    const rec = await h.executor.execute(scenarioRequest("confidential-client-brief", { source: "compare", pinModelId: "anthropic:claude-opus-5-5" }));
    expect(rec.status).toBe("blocked");
    expect(rec.error).toMatch(/Cloud execution prohibited for CONFIDENTIAL data/);
    expect(h.mockCalls).toHaveLength(0);
  });
});

describe("execution service: live mode (fake provider, no network)", () => {
  const live = { AI_LIVE_MODE: "true", DEFAULT_PROVIDER: "live", ANTHROPIC_API_KEY: "sk-ant-test-0000000000000000000" };

  it("requires both switches for paid calls", () => {
    expect(buildHarness({ env: { AI_LIVE_MODE: "true" } }).config.cloudLive).toBe(false);
    expect(buildHarness({ env: { DEFAULT_PROVIDER: "live" } }).config.cloudLive).toBe(false);
    expect(buildHarness({ env: live }).config.cloudLive).toBe(true);
  });

  it("charges actual usage at list price and caches identical requests", async () => {
    const h = buildHarness({ env: live });
    const first = await h.executor.execute(scenarioRequest("public-summary", { allowLive: true }));
    expect(first.mode).toBe("live");
    expect(first.externalCostUsd).toBeCloseTo((420 * 0.1 + 120 * 0.5) / 1e6);
    expect(h.ledger.snapshot().sessionActualUsd).toBeCloseTo(first.externalCostUsd);
    const second = await h.executor.execute(scenarioRequest("public-summary", { allowLive: true }));
    expect(second.externalCostUsd).toBe(0);
    expect(second.trace.map((e) => e.message)).toContain("Served from response cache");
    expect(h.cloud.calls).toHaveLength(1);
  });

  it("does not spend without confirmation; it falls back to local instead", async () => {
    const h = buildHarness({ env: live });
    const rec = await h.executor.execute(scenarioRequest("public-summary"));
    expect(h.cloud.calls).toHaveLength(0);
    expect(rec.mode).toBe("local");
    expect(rec.attempts[0].error?.code).toBe("live_disabled");
  });

  it("passes the capped max_tokens and effort to the provider", async () => {
    const h = buildHarness({ env: { ...live, LIVE_MAX_OUTPUT_TOKENS: "600" } });
    await h.executor.execute(scenarioRequest("strategic-positioning", { allowLive: true }));
    expect(h.cloud.calls[0].maxOutputTokens).toBeLessThanOrEqual(600);
    expect(h.cloud.calls[0].effort).toBe("high");
    expect(h.cloud.calls[0].model).toBe("claude-sonnet-5-5");
  });

  it("refuses the call when the session budget can't cover the worst case", async () => {
    const h = buildHarness({ env: { ...live, SESSION_BUDGET_USD: "0.0001" } });
    const rec = await h.executor.execute(scenarioRequest("strategic-positioning", { allowLive: true }));
    expect(h.cloud.calls).toHaveLength(0);
    expect(rec.budgetGuard || rec.status !== "completed" || rec.location === "local").toBe(true);
  });
});

describe("spend controls under concurrency and confirmation", () => {
  const live = { AI_LIVE_MODE: "true", DEFAULT_PROVIDER: "live", ANTHROPIC_API_KEY: "sk-ant-test-0000000000000000000" };

  it("reserves before calling, so concurrent paid requests cannot overspend", async () => {
    const probe = buildHarness({ env: live });
    const plan = await probe.executor.plan(scenarioRequest("public-summary"));
    const worst = plan.decision.candidates.find((c) => c.modelId === plan.decision.selectedModelId)!.cost.maxCostUsd;
    const h = buildHarness({ env: { ...live, SESSION_BUDGET_USD: String(worst * 1.5) } });
    // Different prompts so the response cache can't serve the second one.
    const [a, b] = await Promise.all([
      h.executor.execute(scenarioRequest("public-summary", { allowLive: true })),
      h.executor.execute({ ...scenarioRequest("public-summary", { allowLive: true }), task: { ...scenarioRequest("public-summary").task, instruction: "Summarize this public announcement in three bullet points for the blog." } }),
    ]);
    expect(h.cloud.calls).toHaveLength(1);
    expect([a.location, b.location].sort()).toEqual(["cloud", "local"]);
    const snap = h.ledger.snapshot();
    expect(snap.sessionActualUsd + (snap.sessionReservedUsd ?? 0)).toBeLessThanOrEqual(worst * 1.5);
    expect(snap.sessionReservedUsd).toBe(0);
  });

  it("refuses a paid attempt above the confirmed ceiling and does not count it as an attempt", async () => {
    const h = buildHarness({ env: live });
    const rec = await h.executor.execute(scenarioRequest("public-summary", { allowLive: true, maxLiveCostUsd: 0.0000001 }));
    expect(h.cloud.calls).toHaveLength(0);
    expect(rec.attempts[0].error?.code).toBe("budget");
    expect(rec.mode).toBe("local");
  });
});

describe("approvals", () => {
  it("records the decision on the execution and in its trace", async () => {
    const h = buildHarness();
    const rec = await h.executor.execute(scenarioRequest("confidential-client-brief"));
    const pending = h.approvals.list("pending")[0];
    h.approvals.decide(pending.id, "approved", "Account lead", "Accurate; OK to share internally.");
    const after = h.executions.get(rec.id)!;
    expect(after.reviewStatus).toBe("approved");
    expect(after.trace.at(-1)).toMatchObject({ stage: "review", message: "Human review approved by Account lead" });
    expect(() => h.approvals.decide(pending.id, "rejected", "x", "")).toThrow(/already approved/);
  });
});

describe("observability", () => {
  it("aggregates overview metrics and separates seeded demo data", async () => {
    const h = buildHarness();
    seedDemoWorkload({ executions: h.executions, approvals: h.approvals, policy: DEFAULT_POLICY, models: ALL_MODELS, days: 3 });
    await h.executor.execute(scenarioRequest("confidential-client-brief"));
    const all = h.executions.overview({});
    const real = h.executions.overview({ realOnly: true });
    expect(all.seedExecutions).toBeGreaterThan(20);
    expect(real.total).toBe(1);
    expect(real.local).toBe(1);
    expect(all.local + all.cloud + all.blocked + all.failed).toBe(all.total);
    expect(all.externalSpendUsd).toBe(0);
    expect(h.executions.daily({}, 3, new Date()).length).toBe(3);
    expect(h.executions.modelDistribution({}).length).toBeGreaterThan(1);
  });

  it("keeps simulated DEMO runs out of the Real executions scope", async () => {
    const h = buildHarness();
    await h.executor.execute(scenarioRequest("public-summary"));
    await h.executor.execute(scenarioRequest("confidential-client-brief"));
    const real = h.executions.overview({ realOnly: true });
    expect(real.total).toBe(1);
    expect(real.cloud).toBe(0);
    expect(real.local).toBe(1);
  });

  it("never reuses a policy version number, even after a reset", () => {
    const h = buildHarness();
    const v1 = h.settings.policy().version;
    h.settings.savePolicy(structuredClone(DEFAULT_POLICY));
    const v2 = h.settings.policy().version;
    h.settings.resetPolicy();
    const v3 = h.settings.policy().version;
    h.settings.savePolicy(structuredClone(DEFAULT_POLICY));
    expect([v1, v2, v3, h.settings.policy().version]).toEqual([1, 2, 3, 4]);
  });

  it("marks every seeded row as demo data", () => {
    const h = buildHarness();
    const n = seedDemoWorkload({ executions: h.executions, approvals: h.approvals, policy: DEFAULT_POLICY, models: ALL_MODELS });
    const rows = h.executions.list({ limit: 1000 }).rows;
    expect(rows).toHaveLength(n);
    expect(rows.every((r) => r.source === "seed" && (r.mode === "demo" || r.status === "blocked"))).toBe(true);
    expect(rows.every((r) => r.externalCostUsd === 0)).toBe(true);
  });

  it("every scenario completes or blocks without throwing", async () => {
    const h = buildHarness();
    for (const s of SCENARIOS) {
      const rec = await h.executor.execute(scenarioRequest(s.id));
      expect(["completed", "blocked"]).toContain(rec.status);
    }
  });
});
