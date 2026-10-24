import { vi } from "vitest";
import { loadConfig, type AppConfig } from "@/config/env";
import { MockProvider } from "@/providers/mock/mock-provider";
import { OllamaProvider } from "@/providers/ollama/ollama-provider";
import type { AIProvider, AIRequest, AIResponse } from "@/providers/types";
import { resolveSimulatedOutput } from "@/scenarios/simulated-outputs";
import { ApprovalService } from "@/services/approvals/approvals";
import { BudgetLedger } from "@/services/budget/ledger";
import { ResponseCache } from "@/services/cache/response-cache";
import { openDatabase } from "@/services/db/database";
import { Executor } from "@/services/execution/executor";
import { ExecutionRepository } from "@/services/observability/repository";
import { ModelRegistry } from "@/services/registry/model-registry";
import { SettingsStore } from "@/services/settings/settings-store";
import { OLLAMA_TAGS } from "./fixtures";

export interface FakeOllamaOptions {
  online?: boolean;
  running?: string[];
  reply?: (body: { model: string; messages: { content: string }[] }) => string;
  failChat?: boolean;
}

/** A fake Ollama HTTP server (as a fetch function) mirroring the dev machine's models. */
export function fakeOllamaFetch(opts: FakeOllamaOptions = {}) {
  const calls: { path: string; body?: unknown }[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path: url.pathname, body });
    if (opts.online === false) throw new TypeError("fetch failed: ECONNREFUSED");
    const j = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    switch (url.pathname) {
      case "/api/version":
        return j({ version: "0.35.1" });
      case "/api/tags":
        return j({ models: OLLAMA_TAGS });
      case "/api/ps":
        return j({ models: (opts.running ?? ["gemma4:12b-it-qat"]).map((name) => ({ name, model: name, size_vram: 7e9 })) });
      case "/api/chat": {
        if (opts.failChat) return new Response("runner crashed", { status: 500 });
        const text = opts.reply?.(body) ?? "- Objective: restore bookings\n- Risk: incomplete data\n- Next step: fix mobile booking flow before the review";
        return j({
          model: body.model,
          message: { role: "assistant", content: text },
          done: true,
          done_reason: "stop",
          load_duration: 15_000_000,
          prompt_eval_count: 812,
          prompt_eval_duration: 5_100_000_000,
          eval_count: 96,
          eval_duration: 6_000_000_000,
        });
      }
    }
    return new Response("not found", { status: 404 });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

/** A fake paid provider that records every call (never touches the network). */
export function fakeCloud(opts: { fail?: boolean } = {}) {
  const calls: AIRequest[] = [];
  const provider: AIProvider = {
    id: "anthropic",
    kind: "cloud",
    async health() {
      return { providerId: "anthropic", status: "online", detail: "fake", checkedAt: new Date().toISOString() };
    },
    async execute(req): Promise<AIResponse> {
      calls.push(req);
      if (opts.fail) throw new Error("should not be reached");
      return {
        text: "- Point one about the alerts\n- Point two about accessibility\n- Point three about the rollout",
        model: req.model,
        providerId: "anthropic",
        usage: { inputTokens: 420, outputTokens: 120, reasoningTokens: 20, source: "provider" },
        latencyMs: 1800,
        stopReason: "end",
        simulated: false,
      };
    },
  };
  return { provider, calls };
}

export function buildHarness(opts: { env?: Record<string, string>; ollama?: FakeOllamaOptions; cloudFail?: boolean } = {}) {
  const config: AppConfig = loadConfig({ SEED_DEMO_DATA: "false", DATA_DIR: "/tmp/unused", ...opts.env } as unknown as NodeJS.ProcessEnv);
  const db = openDatabase(":memory:");
  const executions = new ExecutionRepository(db);
  const approvals = new ApprovalService(db, executions);
  const ledger = new BudgetLedger(db, { sessionBudgetUsd: config.sessionBudgetUsd, lifetimeBudgetUsd: config.lifetimeBudgetUsd, countSimulated: !config.cloudLive });
  const settings = new SettingsStore(db);
  const cache = new ResponseCache(db);
  const ollamaFetch = fakeOllamaFetch(opts.ollama);
  const ollama = new OllamaProvider({ baseUrl: "http://localhost:11434", numCtx: 32768, keepAlive: "5m", timeoutMs: 5000, fetchImpl: ollamaFetch.fn });
  const registry = new ModelRegistry({ config, ollama, settings, executions, db });
  const mockCalls: AIRequest[] = [];
  const mock = new MockProvider(
    (req) => {
      mockCalls.push(req);
      return resolveSimulatedOutput(req, { tier: "economical", modelName: req.model, local: Boolean(req.simulation?.registryModelId?.startsWith("ollama:")) });
    },
    { delayMs: () => 0 },
  );
  const cloud = fakeCloud({ fail: opts.cloudFail });
  const executor = new Executor({ config, registry, ollama, mock, cloud: { anthropic: cloud.provider }, executions, approvals, ledger, settings, cache });
  return { config, db, executions, approvals, ledger, settings, cache, registry, executor, ollamaFetch, cloud, mockCalls };
}
