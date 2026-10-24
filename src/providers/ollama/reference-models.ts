import type { ModelDescriptor } from "@/core/types";
import { localDescriptorsFromTags } from "./discovery";
import type { OllamaTagModel } from "./ollama-provider";

/**
 * The local models installed on the developer's machine (from `ollama list`,
 * 2026-10-24), used by the public portfolio deployment, which cannot and must
 * not reach any Ollama runtime. Routing treats them as real local candidates;
 * their execution is simulated.
 */
const REFERENCE_TAGS: OllamaTagModel[] = [
  {
    name: "gemma4:12b-it-qat",
    model: "gemma4:12b-it-qat",
    size: 7151003754,
    digest: "38044be4f923e5a5",
    details: { family: "gemma4", parameter_size: "11.9B", quantization_level: "Q4_0", context_length: 262144 },
    capabilities: ["completion"],
  },
  {
    name: "qwen3.5:9b",
    model: "qwen3.5:9b",
    size: 6550825550,
    digest: "56671c2ab9385f9c",
    details: { family: "qwen35", parameter_size: "9.0B", quantization_level: "Q4_K_M", context_length: 262144 },
    capabilities: ["completion"],
  },
];

export function referenceLocalModels(numCtx: number): ModelDescriptor[] {
  return localDescriptorsFromTags(REFERENCE_TAGS, { numCtx }).map((m) => ({
    ...m,
    dataLocation: "Developer's machine · Ollama (simulated in this demo)",
    details: { ...m.details, runtime: "Ollama (reference)" },
  }));
}

/** The model resident in memory on the developer's machine during recorded runs. */
export const REFERENCE_RESIDENT_MODEL = "gemma4:12b-it-qat";
