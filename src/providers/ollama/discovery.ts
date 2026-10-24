import { localFamilyDefaults, prettyLocalName } from "@/core/models/local-profiles";
import type { ModelDescriptor } from "@/core/types";
import type { OllamaTagModel } from "./ollama-provider";

export interface DiscoveryOptions {
  numCtx: number;
  /** False when OLLAMA_BASE_URL points off this machine; nothing is registered as on-device then. */
  loopback?: boolean;
  /** Optional allowlist of Ollama model names (OLLAMA_MODELS). Empty = all chat-capable models. */
  allowlist?: string[];
}

/** Ollama cloud models run on ollama.com; they must never be treated as on-device. */
export function isRemoteOllamaModel(t: OllamaTagModel): boolean {
  return Boolean(t.remote_host || t.remote_model) || /(?:^|[-:])cloud$/i.test(t.name);
}

export function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "::1" || /^127\./.test(host);
  } catch {
    return false;
  }
}

/**
 * Turns Ollama's installed-model list into registry entries. Modelfile
 * aliases that share weights with another installed model (for example a
 * "gemma-chat" alias of "gemma4:12b-it-qat") are folded into their base model
 * instead of being registered twice. Embedding-only models are skipped, and
 * so are Ollama cloud models (remote_host / "-cloud" tags), because their
 * inference happens off this machine.
 */
export function localDescriptorsFromTags(tags: OllamaTagModel[], opts: DiscoveryOptions): ModelDescriptor[] {
  if (opts.loopback === false) return [];
  const names = new Set(tags.flatMap((t) => [t.name, t.model]));
  const chatCapable = tags.filter((t) => (!t.capabilities || t.capabilities.includes("completion")) && !isRemoteOllamaModel(t));

  const aliasesOf = new Map<string, string[]>();
  const bases: OllamaTagModel[] = [];
  for (const t of chatCapable) {
    const parent = t.details?.parent_model;
    if (parent && names.has(parent) && parent !== t.name) {
      aliasesOf.set(parent, [...(aliasesOf.get(parent) ?? []), t.name]);
    } else {
      bases.push(t);
    }
  }

  const allow = (opts.allowlist ?? []).filter(Boolean);
  const selected = allow.length ? bases.filter((b) => allow.includes(b.name) || allow.includes(b.name.replace(/:latest$/, ""))) : bases;

  const descriptors = selected.map<ModelDescriptor>((t) => {
    const family = t.details?.family ?? t.name.split(":")[0];
    const defaults = localFamilyDefaults(family === "qwen35" ? "qwen3.5" : family, t.details?.parameter_size);
    const maxContext = t.details?.context_length ?? 8192;
    const displayName = prettyLocalName(t.name, defaults.label, t.details?.parameter_size);
    return {
      id: `ollama:${t.name}`,
      providerId: "ollama",
      providerModelId: t.name,
      displayName,
      shortName: displayName,
      family,
      tier: "local",
      location: "local",
      local: true,
      enabled: true,
      relativeCost: 0,
      capabilities: defaults.capabilities,
      capabilityBasis: defaults.basis,
      contextWindowTokens: Math.min(opts.numCtx, maxContext),
      maxContextTokens: maxContext,
      maxOutputTokens: 4096,
      pricing: null,
      latency: { ...defaults.latency, source: "configured", samples: 0 },
      privacyEligibility: "restricted",
      externalDataTransfer: false,
      dataLocation: "This device · Ollama",
      details: {
        parameterSize: t.details?.parameter_size,
        quantization: t.details?.quantization_level,
        sizeBytes: t.size,
        digest: t.digest?.slice(0, 12),
        aliases: aliasesOf.get(t.name),
        runtime: "Ollama",
      },
    };
  });

  // Disambiguate two installs of the same family and size (e.g. different quantizations).
  const seen = new Map<string, number>();
  for (const d of descriptors) seen.set(d.displayName, (seen.get(d.displayName) ?? 0) + 1);
  for (const d of descriptors) {
    if ((seen.get(d.displayName) ?? 0) > 1) {
      d.displayName = `${d.displayName} (${d.providerModelId.split(":")[1] ?? d.providerModelId})`;
      d.shortName = d.displayName;
    }
  }
  return descriptors;
}
