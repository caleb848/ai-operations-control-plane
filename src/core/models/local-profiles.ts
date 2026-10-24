import type { CapabilityProfile, LatencyProfile } from "../types";

/**
 * Default Configurable Capability Profiles for local model families.
 *
 * Routing configuration, not benchmarks. Defaults for families installed on
 * the development machine were set from the owner's own local evaluation
 * (2026-10-04, thinking off, 5 graded prompts + a 10K-token retrieval test):
 * Gemma 4 12B passed every check; Qwen 3.5 9B missed one arithmetic step, a
 * word limit and one long-context lookup, but generates ~30% faster. Other
 * families get conservative size-based defaults until an operator tunes them.
 */

export interface LocalFamilyDefaults {
  capabilities: CapabilityProfile;
  latency: Omit<LatencyProfile, "source" | "samples">;
  basis: string;
}

const KNOWN_FAMILIES: { match: RegExp; label: string; defaults: LocalFamilyDefaults }[] = [
  {
    match: /^gemma4/,
    label: "Gemma 4",
    defaults: {
      capabilities: { reasoning: 68, creative: 74, extraction: 82, summarization: 82, coding: 70, classification: 82 },
      latency: { overheadMs: 250, prefillTokensPerSec: 159, outputTokensPerSec: 15.9, coldStartMs: 8000 },
      basis: "Owner's local eval 2026-10-04 (thinking off): 5/5 graded prompts, 5/5 on 10K-token retrieval. Speeds from the same benchmark.",
    },
  },
  {
    match: /^qwen3(?:\.5|5)/,
    label: "Qwen 3.5",
    defaults: {
      capabilities: { reasoning: 60, creative: 66, extraction: 74, summarization: 76, coding: 70, classification: 78 },
      latency: { overheadMs: 250, prefillTokensPerSec: 250, outputTokensPerSec: 21.1, coldStartMs: 7000 },
      basis: "Owner's local eval 2026-10-04 (thinking off): missed one arithmetic step, a word limit and one long-context lookup; ~30% faster generation than Gemma 4 12B.",
    },
  },
  {
    match: /^llama3/,
    label: "Llama 3",
    defaults: {
      capabilities: { reasoning: 56, creative: 66, extraction: 72, summarization: 74, coding: 60, classification: 76 },
      latency: { overheadMs: 250, prefillTokensPerSec: 300, outputTokensPerSec: 24, coldStartMs: 6000 },
      basis: "Conservative family default (not yet evaluated on this machine). Tune after a Comparison Lab run.",
    },
  },
  {
    match: /^llama4/,
    label: "Llama 4",
    defaults: {
      capabilities: { reasoning: 66, creative: 70, extraction: 78, summarization: 78, coding: 68, classification: 80 },
      latency: { overheadMs: 300, prefillTokensPerSec: 150, outputTokensPerSec: 12, coldStartMs: 15000 },
      basis: "Conservative family default (not yet evaluated on this machine). Tune after a Comparison Lab run.",
    },
  },
];

export function parseParameterBillions(parameterSize: string | undefined): number | null {
  if (!parameterSize) return null;
  const m = parameterSize.match(/([\d.]+)\s*([BM])/i);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2].toUpperCase() === "M" ? n / 1000 : n;
}

/** Size-based fallback: small models get lower reasoning trust and faster speed. */
function sizeBasedDefaults(params: number | null): LocalFamilyDefaults {
  const p = params ?? 7;
  const scale = Math.max(-1.5, Math.min(1.5, Math.log2(p / 8)));
  const v = (base: number) => Math.round(Math.max(30, Math.min(80, base + scale * 7)));
  return {
    capabilities: {
      reasoning: v(54),
      creative: v(62),
      extraction: v(70),
      summarization: v(72),
      coding: v(56),
      classification: v(74),
    },
    latency: {
      overheadMs: 250,
      prefillTokensPerSec: Math.round(220 * (8 / p)),
      outputTokensPerSec: Math.round(18 * (8 / p) * 10) / 10,
      coldStartMs: Math.round(800 * p),
    },
    basis: `Size-based default for an unrecognized family (${params ? `${params}B` : "unknown size"}). Tune before relying on it.`,
  };
}

export function localFamilyDefaults(family: string, parameterSize?: string): LocalFamilyDefaults & { label: string } {
  const known = KNOWN_FAMILIES.find((f) => f.match.test(family.toLowerCase()));
  if (known) return { ...known.defaults, label: known.label };
  return { ...sizeBasedDefaults(parseParameterBillions(parameterSize)), label: family };
}

export function prettyLocalName(modelName: string, familyLabel: string, parameterSize?: string): string {
  const params = parseParameterBillions(parameterSize);
  const size = params ? (params >= 1 ? `${Math.round(params)}B` : `${Math.round(params * 1000)}M`) : "";
  if (familyLabel && familyLabel !== modelName) return `${familyLabel}${size ? ` ${size}` : ""}`;
  return modelName.replace(/:latest$/, "");
}
