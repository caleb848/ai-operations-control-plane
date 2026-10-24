import type { BudgetSnapshot } from "@/core/budget/budget";
import { DEFAULT_POLICY } from "@/core/governance/policy";
import { ANTHROPIC_MODELS } from "@/core/models/cloud-catalog";
import type { ModelAvailability, RouteRequest } from "@/core/routing/engine";
import type { ModelDescriptor, PriorityMode, TaskInput } from "@/core/types";
import { classifyTask } from "@/core/classification/classify";
import { localDescriptorsFromTags } from "@/providers/ollama/discovery";
import type { OllamaTagModel } from "@/providers/ollama/ollama-provider";

/** Mirrors `ollama list` on the development machine: two base models plus two 32K-context aliases. */
export const OLLAMA_TAGS: OllamaTagModel[] = [
  {
    name: "gemma-chat:latest",
    model: "gemma-chat:latest",
    size: 7151003398,
    digest: "c7e6aac03ecb6c38",
    details: { parent_model: "gemma4:12b-it-qat", family: "gemma4", parameter_size: "11.9B", quantization_level: "Q4_0", context_length: 262144 },
    capabilities: ["completion", "vision", "audio", "tools", "thinking"],
  },
  {
    name: "qwen-chat:latest",
    model: "qwen-chat:latest",
    size: 6550825566,
    digest: "4b44ba7611d86209",
    details: { parent_model: "qwen3.5:9b", family: "qwen35", parameter_size: "9.0B", quantization_level: "Q4_K_M", context_length: 262144 },
    capabilities: ["completion", "vision", "tools", "thinking"],
  },
  {
    name: "gemma4:12b-it-qat",
    model: "gemma4:12b-it-qat",
    size: 7151003754,
    digest: "38044be4f923e5a5",
    details: { parent_model: "", family: "gemma4", parameter_size: "11.9B", quantization_level: "Q4_0", context_length: 262144 },
    capabilities: ["completion", "vision", "audio", "tools", "thinking"],
  },
  {
    name: "qwen3.5:9b",
    model: "qwen3.5:9b",
    size: 6550825550,
    digest: "56671c2ab9385f9c",
    details: { parent_model: "model.gguf", family: "qwen35", parameter_size: "9.0B", quantization_level: "Q4_K_M", context_length: 262144 },
    capabilities: ["completion", "vision", "tools", "thinking"],
  },
];

export const LOCAL_MODELS: ModelDescriptor[] = localDescriptorsFromTags(OLLAMA_TAGS, { numCtx: 32768 });
export const GEMMA = "ollama:gemma4:12b-it-qat";
export const QWEN = "ollama:qwen3.5:9b";
export const HAIKU = "anthropic:claude-haiku-5-5";
export const SONNET = "anthropic:claude-sonnet-5-5";
export const OPUS = "anthropic:claude-opus-5-5";

export const ALL_MODELS: ModelDescriptor[] = [...LOCAL_MODELS, ...ANTHROPIC_MODELS];

export function availability(opts: { ollama?: boolean; warm?: string[]; cloud?: "simulated" | "real" | "down" } = {}): Record<string, ModelAvailability> {
  const ollama = opts.ollama ?? true;
  const out: Record<string, ModelAvailability> = {};
  for (const m of ALL_MODELS) {
    if (m.local) {
      out[m.id] = ollama
        ? { available: true, backend: "real", warm: opts.warm?.includes(m.id) ?? true, reason: "Ollama online" }
        : { available: false, backend: "real", reason: "Ollama offline" };
    } else {
      out[m.id] =
        opts.cloud === "down"
          ? { available: false, backend: "real", reason: "No API key configured for anthropic" }
          : { available: true, backend: opts.cloud ?? "simulated", reason: "DEMO" };
    }
  }
  return out;
}

export const FRESH_BUDGET: BudgetSnapshot = {
  sessionBudgetUsd: 2,
  sessionActualUsd: 0,
  sessionSimulatedUsd: 0,
  lifetimeBudgetUsd: 10,
  lifetimeActualUsd: 0,
};

export function request(task: TaskInput, priorityMode: PriorityMode, overrides: Partial<RouteRequest> = {}): RouteRequest {
  return {
    profile: classifyTask(task),
    models: ALL_MODELS,
    availability: availability(),
    policy: DEFAULT_POLICY,
    priorityMode,
    budget: FRESH_BUDGET,
    baselineModel: ANTHROPIC_MODELS.find((m) => m.id === SONNET),
    ...overrides,
  };
}
