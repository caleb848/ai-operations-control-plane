import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDeploymentCapabilities, resolveDeploymentMode } from "@/config/deployment";
import { loadConfig } from "@/config/env";
import { MockProvider } from "@/providers/mock/mock-provider";
import { OllamaProvider } from "@/providers/ollama/ollama-provider";
import type { AIProvider } from "@/providers/types";
import { getScenario, SCENARIOS } from "@/scenarios/scenarios";
import { resolveSimulatedOutput } from "@/scenarios/simulated-outputs";
import { taskRequestSchema } from "@/server/schemas";
import { ApprovalService } from "@/services/approvals/approvals";
import { BudgetLedger, ledgerLimitsFor } from "@/services/budget/ledger";
import { ResponseCache } from "@/services/cache/response-cache";
import { openDatabase } from "@/services/db/database";
import { DeploymentRestrictionError, Executor, type ExecuteRequest } from "@/services/execution/executor";
import { ExecutionRepository } from "@/services/observability/repository";
import { ModelRegistry } from "@/services/registry/model-registry";
import { seedDemoWorkload } from "@/services/seed/demo-workload";
import { SettingsStore } from "@/services/settings/settings-store";
import { fakeOllamaFetch } from "../support/harness";

const PORTFOLIO_ENV = {
  DEPLOYMENT_MODE: "portfolio",
  // Hostile settings that must all be ignored:
  AI_LIVE_MODE: "true",
  DEFAULT_PROVIDER: "live",
  ANTHROPIC_API_KEY: "sk-ant-test-leaked-into-hosting-env-000000",
  OPENAI_API_KEY: "sk-test-leaked-000000000000000000000",
  OPENAI_MODEL: "gpt-test",
  OPENAI_INPUT_PRICE_PER_MTOK: "1",
  OPENAI_OUTPUT_PRICE_PER_MTOK: "4",
  GEMINI_API_KEY: "AIza-test-leaked-0000000000000000000000",
  SESSION_BUDGET_USD: "999",
  LIFETIME_BUDGET_USD: "999",
  OLLAMA_BASE_URL: "http://203.0.113.7:11434",
} as unknown as NodeJS.ProcessEnv;

function spyProvider(id: "anthropic" | "openai" | "google") {
  const calls: string[] = [];
  const provider: AIProvider = {
    id,
    kind: "cloud",
    health: async () => ({ providerId: id, status: "online", detail: "spy", checkedAt: new Date().toISOString() }),
    execute: async (req) => {
      calls.push(req.model);
      throw new Error(`${id} must never be called in portfolio mode`);
    },
  };
  return { provider, calls };
}

/**
 * Portfolio executor wired the way a careless refactor might: real-looking
 * cloud providers and a reachable (fake) Ollama are present. The guarantees
 * must hold anyway.
 */
function portfolioHarness() {
  const config = loadConfig(PORTFOLIO_ENV);
  const db = openDatabase({ kind: "memory", driver: "node:sqlite" });
  const executions = new ExecutionRepository(db);
  const approvals = new ApprovalService(db, executions);
  const ledger = new BudgetLedger(db, ledgerLimitsFor(config));
  const settings = new SettingsStore(db);
  const cache = new ResponseCache(db);
  const ollamaFetch = fakeOllamaFetch();
  const ollama = new OllamaProvider({ baseUrl: "http://localhost:11434", numCtx: 32768, keepAlive: "5m", timeoutMs: 5000, fetchImpl: ollamaFetch.fn });
  const registry = new ModelRegistry({ config, ollama, settings, executions, db });
  const mock = new MockProvider(
    (req) => resolveSimulatedOutput(req, { local: Boolean(req.simulation?.registryModelId?.startsWith("ollama:")), modelName: req.model }),
    { delayMs: () => 0 },
  );
  const anthropic = spyProvider("anthropic");
  const openai = spyProvider("openai");
  const google = spyProvider("google");
  const executor = new Executor({
    config,
    registry,
    ollama,
    mock,
    cloud: { anthropic: anthropic.provider, openai: openai.provider, google: google.provider },
    executions,
    approvals,
    ledger,
    settings,
    cache,
  });
  const paidCalls = () => anthropic.calls.length + openai.calls.length + google.calls.length;
  return { config, db, executions, approvals, ledger, registry, executor, ollamaFetch, paidCalls };
}

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

describe("deployment mode resolution (fails closed)", () => {
  it("defaults to local on a developer machine", () => {
    expect(resolveDeploymentMode({} as NodeJS.ProcessEnv).mode).toBe("local");
    expect(resolveDeploymentMode({ DEPLOYMENT_MODE: "local" } as unknown as NodeJS.ProcessEnv).mode).toBe("local");
  });
  it("is portfolio when asked, on any hosting platform, or for an unrecognized value", () => {
    for (const env of [{ DEPLOYMENT_MODE: "portfolio" }, { NETLIFY: "true" }, { VERCEL: "1" }, { AWS_LAMBDA_FUNCTION_NAME: "fn" }, { DEPLOYMENT_MODE: "public" }]) {
      expect(resolveDeploymentMode(env as unknown as NodeJS.ProcessEnv).mode).toBe("portfolio");
    }
    // Hosting wins even over an explicit local request.
    expect(resolveDeploymentMode({ NETLIFY: "true", DEPLOYMENT_MODE: "local" } as unknown as NodeJS.ProcessEnv).mode).toBe("portfolio");
  });
  it("exposes one capability object for the whole app", () => {
    const caps = getDeploymentCapabilities({ DEPLOYMENT_MODE: "portfolio" } as unknown as NodeJS.ProcessEnv);
    expect(caps).toMatchObject({ localInference: false, liveCloudInference: false, ollamaAccess: false, simulatedInference: true, persistentStorage: false, publicDeployment: true });
  });
});

describe("portfolio configuration never reads provider secrets", () => {
  const config = loadConfig(PORTFOLIO_ENV);
  it("forces live mode off whatever the environment says", () => {
    expect(config.liveMode).toBe(false);
    expect(config.defaultProvider).toBe("mock");
    expect(config.cloudLive).toBe(false);
  });
  it("drops every provider key at the source and reports what it ignored", () => {
    expect(config.anthropic.apiKey).toBeUndefined();
    expect(config.openai.apiKey).toBeUndefined();
    expect(config.gemini.apiKey).toBeUndefined();
    expect(config.openai.model).toBeUndefined();
    expect(config.ignored).toEqual(expect.arrayContaining(["AI_LIVE_MODE", "DEFAULT_PROVIDER", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]));
  });
  it("fixes the demo budgets so a hosting variable can't change how the scenarios behave", () => {
    expect(config.sessionBudgetUsd).toBe(2);
    expect(config.lifetimeBudgetUsd).toBe(10);
    expect(config.ignored).toEqual(expect.arrayContaining(["SESSION_BUDGET_USD", "LIFETIME_BUDGET_USD", "OLLAMA_BASE_URL"]));
  });
});

describe("portfolio execution: real routing, simulated inference only", () => {
  it("runs all six scenarios with zero Ollama calls and zero paid calls", async () => {
    const h = portfolioHarness();
    const results = new Map<string, Awaited<ReturnType<typeof h.executor.execute>>>();
    for (const s of SCENARIOS) results.set(s.id, await h.executor.execute(scenarioRequest(s.id)));

    expect(h.ollamaFetch.calls).toHaveLength(0);
    expect(h.paidCalls()).toBe(0);

    const s1 = results.get("confidential-client-brief")!;
    expect(s1.status).toBe("completed");
    expect(s1.mode).toBe("demo");
    expect(s1.executedModelId).toBe("ollama:gemma4:12b-it-qat");
    expect(s1.decision.summary.blockedByPolicy).toBe(3);
    expect(s1.trace.map((e) => e.detail ?? "").join(" ")).toMatch(/On a local installation this request would execute through Ollama/);
    expect(s1.externalCostUsd).toBe(0);

    expect(results.get("public-summary")!.executedModelId).toBe("anthropic:claude-haiku-5-5");
    expect(results.get("public-summary")!.mode).toBe("demo");
    expect(results.get("strategic-positioning")!.executedModelId).toBe("anthropic:claude-sonnet-5-5");
    expect(results.get("provider-failure")!.fallbackUsed).toBe(true);
    expect(results.get("provider-failure")!.location).toBe("local");
    expect(results.get("budget-exhausted")!.budgetGuard).toBe(true);
    expect(results.get("budget-exhausted")!.decision.budgetGuard?.originalModelId).toBe("anthropic:claude-opus-5-5");
    expect(results.get("restricted-local-offline")!.status).toBe("blocked");
    expect(results.get("restricted-local-offline")!.error).toBe("Local execution required by policy, but the approved local provider is unavailable.");

    for (const r of results.values()) expect(r.externalCostUsd).toBe(0);
    expect(h.ledger.snapshot().lifetimeActualUsd).toBe(0);
  });

  it("replays a recorded real local output, labeled, and evaluates only real text", async () => {
    const h = portfolioHarness();
    const s1 = await h.executor.execute(scenarioRequest("confidential-client-brief"));
    expect(s1.trace.map((e) => e.message)).toContain("Recorded local output replayed");
    expect(s1.evalScore).not.toBeNull();
    const custom = await h.executor.execute({ task: { instruction: "Summarize the attached note for the team.", context: "The offsite moved to Thursday." }, priorityMode: "privacy_first", source: "console" });
    expect(custom.outputText).toMatch(/was not called/);
    expect(custom.evalScore).toBeNull();
    expect(custom.trace.map((e) => e.message)).toContain("Evaluation skipped");
  });

  it("allowLive or a cost ceiling cannot bypass portfolio mode", async () => {
    const h = portfolioHarness();
    await expect(h.executor.execute(scenarioRequest("public-summary", { allowLive: true }))).rejects.toBeInstanceOf(DeploymentRestrictionError);
    await expect(h.executor.execute(scenarioRequest("public-summary", { maxLiveCostUsd: 1 }))).rejects.toBeInstanceOf(DeploymentRestrictionError);
    expect(h.paidCalls()).toBe(0);
  });

  it("pinning a paid cloud model still only simulates it", async () => {
    const h = portfolioHarness();
    const rec = await h.executor.execute(scenarioRequest("public-summary", { pinModelId: "anthropic:claude-opus-5-5", source: "compare" }));
    expect(rec.mode).toBe("demo");
    expect(rec.executedModelId).toBe("anthropic:claude-opus-5-5");
    expect(h.paidCalls()).toBe(0);
    expect(h.ollamaFetch.calls).toHaveLength(0);
  });

  it("governance and the budget guard behave exactly as in local mode", async () => {
    const h = portfolioHarness();
    const plan = await h.executor.plan(scenarioRequest("confidential-client-brief"));
    expect(plan.decision.candidates.filter((c) => c.location === "cloud").every((c) => c.status === "blocked_policy")).toBe(true);
    const budget = await h.executor.plan(scenarioRequest("budget-exhausted"));
    expect(budget.decision.budgetGuard?.reroutedToModelId).toBe("ollama:gemma4:12b-it-qat");
  });

  it("never shares text a visitor typed: only unedited scenarios enter the shared history", async () => {
    const h = portfolioHarness();
    const scenario = await h.executor.execute(scenarioRequest("confidential-client-brief"));
    expect(h.executions.get(scenario.id)).toBeTruthy();
    const custom = await h.executor.execute({
      task: { instruction: "Visitor-written text that must not be shown to other visitors", context: "", declaredClassification: "internal" },
      priorityMode: "balanced",
      source: "console",
    });
    expect(custom.status).toBe("completed");
    expect(h.executions.get(custom.id)).toBeFalsy();
    const edited = await h.executor.execute(scenarioRequest("confidential-client-brief", { task: { instruction: "Edited " + getScenario("confidential-client-brief")!.instruction, context: getScenario("confidential-client-brief")!.context } }));
    expect(h.executions.get(edited.id)).toBeFalsy();
    expect(h.approvals.list("pending").some((a) => a.executionId === edited.id)).toBe(false);
    expect(edited.trace.some((e) => e.message === "Kept private to this browser")).toBe(true);
  });

  it("visitors' simulated spend never exhausts the shared demo budget", async () => {
    const h = portfolioHarness();
    // Far more simulated spend than the $2 session budget, as heavy traffic on one instance would produce.
    for (let i = 0; i < 300; i++) h.ledger.charge({ executionId: null, modelId: "anthropic:claude-opus-5-5", kind: "simulated", amountUsd: 0.05, inputTokens: 1, outputTokens: 1 });
    expect(h.ledger.snapshot().sessionSimulatedTotalUsd).toBeCloseTo(15);
    const plan = await h.executor.plan(scenarioRequest("strategic-positioning"));
    expect(plan.decision.budgetGuard).toBeFalsy();
    expect(plan.decision.selectedModelId).toBe("anthropic:claude-sonnet-5-5");
    // The Budget Guard scenario still demonstrates the guard, because it sets the session spend explicitly.
    expect((await h.executor.plan(scenarioRequest("budget-exhausted"))).decision.budgetGuard?.reroutedToModelId).toBe("ollama:gemma4:12b-it-qat");
  });

  it("registers reference local models without contacting Ollama", async () => {
    const h = portfolioHarness();
    const snap = await h.registry.snapshot();
    expect(snap.models.filter((m) => m.local).map((m) => m.providerModelId).sort()).toEqual(["gemma4:12b-it-qat", "qwen3.5:9b"]);
    expect(snap.models.some((m) => m.providerId === "openai" || m.providerId === "google")).toBe(false);
    expect(Object.values(snap.availability).every((a) => a.backend === "simulated")).toBe(true);
    expect(snap.ollama.status).toBe("simulated");
    expect(h.ollamaFetch.calls).toHaveLength(0);
    await expect(h.registry.probeOllama(true)).rejects.toThrow(/disabled/);
  });

  it("seeds and queries demo data on node:sqlite in memory", () => {
    const h = portfolioHarness();
    expect(h.db.driver).toBe("node:sqlite");
    const n = seedDemoWorkload({ executions: h.executions, approvals: h.approvals, policy: (h.executor as unknown as { d: { settings: SettingsStore } }).d.settings.policy(), models: [] });
    expect(n).toBeGreaterThan(0);
    const metrics = h.executions.overview({});
    expect(metrics.total).toBe(n);
    const pending = h.approvals.list("pending")[0];
    if (pending) {
      h.approvals.decide(pending.id, "approved", "Visitor", "");
      expect(h.executions.get(pending.executionId)?.reviewStatus).toBe("approved");
    }
  });
});

describe("request validation", () => {
  it("rejects hidden or unknown parameters such as a forced provider", () => {
    expect(taskRequestSchema.safeParse({ instruction: "Summarize this", provider: "anthropic" }).success).toBe(false);
    expect(taskRequestSchema.safeParse({ instruction: "Summarize this", forceModel: "claude-opus-5-5" }).success).toBe(false);
    expect(taskRequestSchema.safeParse({ instruction: "Summarize this", simulation: { liveOverride: true } }).success).toBe(false);
    expect(taskRequestSchema.safeParse({ instruction: "Summarize this" }).success).toBe(true);
  });
});

describe("portfolio API route (direct calls cannot bypass)", () => {
  const ORIGIN = "https://ai-ops-demo.example";
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request(`${ORIGIN}/api/execute`, { method: "POST", headers: { "Content-Type": "application/json", host: "ai-ops-demo.example", origin: ORIGIN, ...headers }, body: JSON.stringify(body) });

  beforeEach(() => {
    vi.resetModules();
    globalThis.__aiopsContainer = undefined;
    globalThis.__aiopsReady = undefined;
    for (const [k, v] of Object.entries(PORTFOLIO_ENV)) vi.stubEnv(k, String(v));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.__aiopsContainer = undefined;
    globalThis.__aiopsReady = undefined;
  });

  it("serves simulated execution and rejects paid execution with 403", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("@/app/api/execute/route");
    const s = getScenario("confidential-client-brief")!;
    const ok = await POST(post({ instruction: s.instruction, context: s.context, scenarioId: s.id }));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.record.mode).toBe("demo");

    const live = await POST(post({ instruction: s.instruction, allowLive: true }));
    expect(live.status).toBe(403);
    expect((await live.json()).error).toMatch(/Execution unavailable in Portfolio Mode/);
    expect((await POST(post({ instruction: s.instruction, maxLiveCostUsd: 0.5 }))).status).toBe(403);
    expect((await POST(post({ instruction: s.instruction, provider: "anthropic" }))).status).toBe(400);
    expect((await POST(post({ instruction: s.instruction }, { origin: "https://evil.example" }))).status).toBe(403);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("keeps governance configuration read-only", async () => {
    const { PUT } = await import("@/app/api/policy/route");
    const res = await PUT(new Request(`${ORIGIN}/api/policy`, { method: "PUT", headers: { host: "ai-ops-demo.example", origin: ORIGIN }, body: "{}" }));
    expect(res.status).toBe(403);
  });
});
