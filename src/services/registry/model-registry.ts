import type { AppConfig } from "@/config/env";
import { ANTHROPIC_MODELS, configuredCloudModel } from "@/core/models/cloud-catalog";
import type { ModelAvailability } from "@/core/routing/engine";
import type { ModelDescriptor, SimulationOptions } from "@/core/types";
import { isLoopbackUrl, localDescriptorsFromTags } from "@/providers/ollama/discovery";
import { REFERENCE_RESIDENT_MODEL, referenceLocalModels } from "@/providers/ollama/reference-models";
import type { LocalRuntime, OllamaTagModel } from "@/providers/ollama/ollama-provider";
import type { DB } from "../db/database";
import { median, type ExecutionRepository } from "../observability/repository";
import type { SettingsStore } from "../settings/settings-store";

export interface OllamaStatus {
  /** "simulated" = portfolio deployment: Ollama is never contacted. */
  status: "online" | "offline" | "simulated";
  simulatedOffline: boolean;
  version?: string;
  detail: string;
  baseUrl: string;
  installed: number;
  running: { name: string; sizeVramBytes?: number; expiresAt?: string }[];
  lastSeenAt?: string;
  latencyMs?: number;
}

export interface RegistrySnapshot {
  models: ModelDescriptor[];
  availability: Record<string, ModelAvailability>;
  ollama: OllamaStatus;
  cloudLive: boolean;
  checkedAt: string;
}

/**
 * Builds the model registry for each routing decision:
 *   cloud catalog + Ollama discovery + operator overrides + measured latency.
 * If Ollama is down, the last discovered local models stay registered and are
 * reported as unavailable, so the UI shows "Offline" instead of losing them.
 */
export class ModelRegistry {
  private healthCache: { at: number; value: Omit<OllamaStatus, "simulatedOffline">; tags: OllamaTagModel[] } | null = null;

  constructor(
    private readonly deps: {
      config: AppConfig;
      ollama: LocalRuntime;
      settings: SettingsStore;
      executions: ExecutionRepository;
      db: DB;
      now?: () => Date;
    },
  ) {}

  private lastTags(): { tags: OllamaTagModel[]; at?: string } {
    const r = this.deps.db.prepare(`SELECT value_json, updated_at FROM settings WHERE key = 'ollama_last_tags'`).get() as
      | { value_json: string; updated_at: string }
      | undefined;
    return r ? { tags: JSON.parse(r.value_json), at: r.updated_at } : { tags: [] };
  }

  private saveTags(tags: OllamaTagModel[]): void {
    this.deps.db
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at) VALUES ('ollama_last_tags', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      )
      .run(JSON.stringify(tags), new Date().toISOString());
  }

  /** Probes Ollama (cached ~3 s so dashboards can poll cheaply). */
  async probeOllama(force = false): Promise<{ status: Omit<OllamaStatus, "simulatedOffline">; tags: OllamaTagModel[] }> {
    if (!this.deps.config.deployment.ollamaAccess) throw new Error("Ollama access is disabled in this deployment");
    const nowMs = Date.now();
    if (!force && this.healthCache && nowMs - this.healthCache.at < 3000) {
      return { status: this.healthCache.value, tags: this.healthCache.tags };
    }
    const { ollama, config } = this.deps;
    const health = await ollama.health();
    let tags: OllamaTagModel[] = [];
    let running: OllamaStatus["running"] = [];
    if (health.status === "online") {
      try {
        tags = await ollama.listModels();
        this.saveTags(tags);
        running = (await ollama.runningModels()).map((m) => ({ name: m.name, sizeVramBytes: m.size_vram, expiresAt: m.expires_at }));
      } catch {
        tags = this.lastTags().tags;
      }
    } else {
      tags = this.lastTags().tags;
    }
    const value: Omit<OllamaStatus, "simulatedOffline"> = {
      status: health.status === "online" ? "online" : "offline",
      version: health.version,
      detail: health.detail,
      baseUrl: config.ollama.baseUrl,
      installed: tags.length,
      running,
      lastSeenAt: health.status === "online" ? new Date().toISOString() : this.lastTags().at,
      latencyMs: health.latencyMs,
    };
    this.healthCache = { at: nowMs, value, tags };
    return { status: value, tags };
  }

  private applyMeasurements(model: ModelDescriptor): ModelDescriptor {
    const m = this.deps.executions.measuredThroughput(model.id);
    if (model.local && m.outputTps.length) {
      return {
        ...model,
        latency: {
          ...model.latency,
          outputTokensPerSec: median(m.outputTps) ?? model.latency.outputTokensPerSec,
          prefillTokensPerSec: median(m.prefillTps) ?? model.latency.prefillTokensPerSec,
          source: "measured",
          samples: m.outputTps.length,
        },
      };
    }
    if (!model.local && m.latencyMs.length) {
      const rates = m.latencyMs
        .map((ms, i) => (m.outputTokens[i] ?? 0) / Math.max(0.2, (ms - model.latency.overheadMs) / 1000))
        .filter((r) => r > 0);
      if (rates.length) {
        return {
          ...model,
          latency: { ...model.latency, outputTokensPerSec: median(rates) ?? model.latency.outputTokensPerSec, source: "measured", samples: rates.length },
        };
      }
    }
    return model;
  }

  private applyOverrides(models: ModelDescriptor[]): ModelDescriptor[] {
    const overrides = this.deps.settings.modelOverrides();
    return models.map((m) => {
      const o = overrides[m.id];
      if (!o) return m;
      return {
        ...m,
        enabled: o.enabled ?? m.enabled,
        capabilities: { ...m.capabilities, ...o.capabilities },
        capabilityBasis: o.capabilities && Object.keys(o.capabilities).length ? `Operator-tuned. Default basis: ${m.capabilityBasis}` : m.capabilityBasis,
      };
    });
  }

  cloudModels(): ModelDescriptor[] {
    const { config } = this.deps;
    const models = [...ANTHROPIC_MODELS];
    const o = config.openai;
    if (o.apiKey && o.model && o.inputPerMTok !== undefined && o.outputPerMTok !== undefined) {
      models.push(configuredCloudModel({ providerId: "openai", modelId: o.model, inputPerMTok: o.inputPerMTok, outputPerMTok: o.outputPerMTok }));
    }
    const g = config.gemini;
    if (g.apiKey && g.model && g.inputPerMTok !== undefined && g.outputPerMTok !== undefined) {
      models.push(configuredCloudModel({ providerId: "google", modelId: g.model, inputPerMTok: g.inputPerMTok, outputPerMTok: g.outputPerMTok }));
    }
    return models;
  }

  private providerKey(providerId: ModelDescriptor["providerId"]): string | undefined {
    const { config } = this.deps;
    if (providerId === "anthropic") return config.anthropic.apiKey;
    if (providerId === "openai") return config.openai.apiKey;
    if (providerId === "google") return config.gemini.apiKey;
    return undefined;
  }

  /** Portfolio deployments: reference local models, simulated execution, no network access at all. */
  private portfolioSnapshot(simulation?: SimulationOptions): RegistrySnapshot {
    const { config } = this.deps;
    const simulatedOffline = Boolean(simulation?.ollamaOffline);
    const models = this.applyOverrides([...referenceLocalModels(config.ollama.numCtx), ...this.cloudModels()]);
    const availability: Record<string, ModelAvailability> = {};
    for (const m of models) {
      availability[m.id] = m.local
        ? simulatedOffline
          ? { available: false, backend: "simulated", reason: "Ollama offline (simulated by scenario)" }
          : {
              available: true,
              backend: "simulated",
              warm: m.providerModelId === REFERENCE_RESIDENT_MODEL,
              reason: "Portfolio demo: local inference simulated (a local install runs this through Ollama)",
            }
        : { available: true, backend: "simulated", reason: "Portfolio demo: cloud execution simulated (no API calls)" };
    }
    return {
      models,
      availability,
      ollama: {
        status: simulatedOffline ? "offline" : "simulated",
        simulatedOffline,
        detail: "This public deployment has no route to any Ollama server; local models are simulated with reference profiles",
        baseUrl: "",
        installed: models.filter((m) => m.local).length,
        running: simulatedOffline ? [] : [{ name: REFERENCE_RESIDENT_MODEL }],
      },
      cloudLive: false,
      checkedAt: new Date().toISOString(),
    };
  }

  async snapshot(simulation?: SimulationOptions): Promise<RegistrySnapshot> {
    const { config } = this.deps;
    if (!config.deployment.ollamaAccess) return this.portfolioSnapshot(simulation);
    const probe = await this.probeOllama();
    const simulatedOffline = Boolean(simulation?.ollamaOffline);
    const ollamaUp = probe.status.status === "online" && !simulatedOffline;

    const local = localDescriptorsFromTags(probe.tags, { numCtx: config.ollama.numCtx, allowlist: config.ollama.models, loopback: isLoopbackUrl(config.ollama.baseUrl) });
    const models = this.applyOverrides([...local, ...this.cloudModels()]).map((m) => this.applyMeasurements(m));
    const runningNames = new Set(probe.status.running.map((r) => r.name));

    const availability: Record<string, ModelAvailability> = {};
    for (const m of models) {
      if (m.local) {
        if (simulatedOffline) {
          availability[m.id] = { available: false, backend: "real", reason: "Ollama offline (simulated by scenario)" };
        } else if (!ollamaUp) {
          availability[m.id] = { available: false, backend: "real", reason: `Ollama offline at ${config.ollama.baseUrl}` };
        } else {
          const warm = runningNames.has(m.providerModelId);
          availability[m.id] = {
            available: true,
            backend: "real",
            warm,
            reason: warm ? "Ollama online · model resident in memory" : "Ollama online · cold start expected",
          };
        }
      } else if (!config.cloudLive) {
        availability[m.id] = { available: true, backend: "simulated", reason: "DEMO: served by MockProvider (no API call)" };
      } else if (!this.providerKey(m.providerId)) {
        availability[m.id] = { available: false, backend: "real", reason: `No API key configured for ${m.providerId}` };
      } else {
        availability[m.id] = { available: true, backend: "real", reason: "Live API · key configured" };
      }
    }

    return {
      models,
      availability,
      ollama: { ...probe.status, status: simulatedOffline ? "offline" : probe.status.status, simulatedOffline },
      cloudLive: config.cloudLive,
      checkedAt: new Date().toISOString(),
    };
  }
}
