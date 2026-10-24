import "server-only";
import path from "node:path";
import { loadConfig, type AppConfig } from "@/config/env";
import { ANTHROPIC_MODELS } from "@/core/models/cloud-catalog";
import { AnthropicProvider } from "@/providers/anthropic/anthropic-provider";
import { GeminiProvider } from "@/providers/google/gemini-provider";
import { MockProvider } from "@/providers/mock/mock-provider";
import { DisabledOllamaProvider } from "@/providers/ollama/disabled-ollama";
import { OllamaProvider } from "@/providers/ollama/ollama-provider";
import { OpenAIProvider } from "@/providers/openai/openai-provider";
import type { AIProvider } from "@/providers/types";
import { resolveSimulatedOutput } from "@/scenarios/simulated-outputs";
import { ApprovalService } from "@/services/approvals/approvals";
import { BudgetLedger, ledgerLimitsFor } from "@/services/budget/ledger";
import { ResponseCache } from "@/services/cache/response-cache";
import { openDatabase, type DB } from "@/services/db/database";
import { Executor, type ExecutorDeps } from "@/services/execution/executor";
import { ExecutionRepository } from "@/services/observability/repository";
import { ModelRegistry } from "@/services/registry/model-registry";
import { seedDemoWorkload } from "@/services/seed/demo-workload";
import { SettingsStore } from "@/services/settings/settings-store";

/**
 * Composition root. The only module that reads configuration and wires
 * providers to services. Server-only: API keys never reach client bundles.
 *
 * Portfolio deployments get a different graph, not just different flags:
 * no Ollama client (a stub that refuses), no cloud provider objects at all,
 * and an in-memory database. Nothing that could reach the developer's
 * machine or a paid API exists in that process.
 */
export interface Container {
  config: AppConfig;
  db: DB;
  executions: ExecutionRepository;
  approvals: ApprovalService;
  ledger: BudgetLedger;
  settings: SettingsStore;
  cache: ResponseCache;
  registry: ModelRegistry;
  executor: Executor;
}

declare global {
  var __aiopsContainer: Container | undefined;
  var __aiopsReady: Promise<Container> | undefined;
}

function build(): Container {
  const config = loadConfig();
  const caps = config.deployment;
  if (caps.mode === "portfolio") {
    console.info(`[control-plane] portfolio mode (${caps.reason}): simulated inference only; no Ollama, no paid APIs, in-memory data.`);
    if (config.ignored.length) console.warn(`[control-plane] ignored in portfolio mode: ${config.ignored.join(", ")}`);
  }

  const db = caps.persistentStorage ? openDatabase({ kind: "file", path: path.join(config.dataDir, "control-plane.db") }) : openDatabase({ kind: "memory", driver: "node:sqlite" });
  const executions = new ExecutionRepository(db);
  const approvals = new ApprovalService(db, executions);
  const ledger = new BudgetLedger(db, ledgerLimitsFor(config));
  const settings = new SettingsStore(db);
  const cache = new ResponseCache(db);

  const ollama = caps.ollamaAccess
    ? new OllamaProvider({ baseUrl: config.ollama.baseUrl, numCtx: config.ollama.numCtx, keepAlive: config.ollama.keepAlive, timeoutMs: config.ollama.timeoutMs })
    : new DisabledOllamaProvider();
  const registry = new ModelRegistry({ config, ollama, settings, executions, db });

  const catalog = (id?: string) => ANTHROPIC_MODELS.find((m) => m.id === id);
  const mock = new MockProvider(
    (req) => {
      const id = req.simulation?.registryModelId;
      const local = Boolean(id?.startsWith("ollama:"));
      return resolveSimulatedOutput(req, { local, tier: catalog(id)?.tier, modelName: local ? undefined : (catalog(id)?.displayName ?? req.model) });
    },
    // Portfolio: a short, fixed pause so the workflow is visible without making visitors wait.
    caps.publicDeployment ? { delayMs: () => 1200 } : {},
  );

  // Cloud provider objects exist only where paid inference is possible at all.
  const cloud: ExecutorDeps["cloud"] = {};
  if (caps.liveCloudInference) {
    const providers: Record<"anthropic" | "openai" | "google", AIProvider> = {
      anthropic: new AnthropicProvider({ apiKey: config.anthropic.apiKey, liveMode: config.cloudLive, timeoutMs: config.anthropic.timeoutMs }),
      openai: new OpenAIProvider({ apiKey: config.openai.apiKey, liveMode: config.cloudLive, timeoutMs: config.anthropic.timeoutMs }),
      google: new GeminiProvider({ apiKey: config.gemini.apiKey, liveMode: config.cloudLive, timeoutMs: config.anthropic.timeoutMs }),
    };
    Object.assign(cloud, providers);
  }

  const executor = new Executor({ config, registry, ollama, mock, cloud, executions, approvals, ledger, settings, cache });
  return { config, db, executions, approvals, ledger, settings, cache, registry, executor };
}

export function getContainer(): Container {
  globalThis.__aiopsContainer ??= build();
  return globalThis.__aiopsContainer;
}

/** Container plus first-run demo seeding (needs an async registry snapshot). */
export function ready(): Promise<Container> {
  globalThis.__aiopsReady ??= (async () => {
    const c = getContainer();
    if (c.config.seedDemoData && !c.executions.hasAny()) {
      // Seeding is a convenience; a failure here must never take the app down.
      try {
        const snap = await c.registry.snapshot();
        seedDemoWorkload({ executions: c.executions, approvals: c.approvals, policy: c.settings.policy(), models: snap.models });
      } catch (err) {
        console.error(`[control-plane] demo seed skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return c;
  })();
  return globalThis.__aiopsReady;
}
