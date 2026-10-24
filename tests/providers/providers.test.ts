import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { AnthropicProvider, normalizeAnthropicError } from "@/providers/anthropic/anthropic-provider";
import { GeminiProvider } from "@/providers/google/gemini-provider";
import { localDescriptorsFromTags } from "@/providers/ollama/discovery";
import { OllamaProvider } from "@/providers/ollama/ollama-provider";
import { OpenAIProvider } from "@/providers/openai/openai-provider";
import { ProviderError } from "@/providers/types";
import { OLLAMA_TAGS } from "../support/fixtures";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function ollama(fetchImpl: typeof fetch) {
  return new OllamaProvider({ baseUrl: "http://localhost:11434", numCtx: 32768, keepAlive: "5m", timeoutMs: 5000, fetchImpl });
}

describe("OllamaProvider", () => {
  it("sends think:false, num_ctx and num_predict, and maps Ollama's timings", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ model: "gemma4:12b-it-qat", stream: false, think: false, options: { num_ctx: 32768, num_predict: 300 } });
      expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
      return json({
        model: "gemma4:12b-it-qat",
        message: { role: "assistant", content: " Local answer. " },
        done: true,
        done_reason: "stop",
        load_duration: 2_400_000_000,
        prompt_eval_count: 821,
        prompt_eval_duration: 5_160_000_000,
        eval_count: 64,
        eval_duration: 4_000_000_000,
      });
    }) as unknown as typeof fetch;
    const r = await ollama(fetchImpl).execute({ model: "gemma4:12b-it-qat", system: "sys", prompt: "hi", maxOutputTokens: 300 });
    expect(r.text).toBe("Local answer.");
    expect(r.simulated).toBe(false);
    expect(r.usage).toEqual({ inputTokens: 821, outputTokens: 64, reasoningTokens: 0, source: "provider" });
    expect(r.timings).toMatchObject({ loadMs: 2400, promptTokensPerSec: 159, outputTokensPerSec: 16 });
    expect(r.stopReason).toBe("end");
  });

  it("maps done_reason=length to max_tokens", async () => {
    const f = (async () => json({ model: "m", message: { content: "x" }, done_reason: "length", eval_count: 1, eval_duration: 1e9 })) as unknown as typeof fetch;
    expect((await ollama(f).execute({ model: "m", prompt: "p", maxOutputTokens: 1 })).stopReason).toBe("max_tokens");
  });

  it("raises a provider-scoped 'unavailable' error when Ollama is not running", async () => {
    const f = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const err = await ollama(f)
      .execute({ model: "m", prompt: "p", maxOutputTokens: 10 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe("unavailable");
    expect(err.opts.scope).toBe("provider");
  });

  it("reports offline health instead of throwing", async () => {
    const f = (async () => {
      throw new TypeError("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const h = await ollama(f).health();
    expect(h.status).toBe("offline");
    expect(h.detail).toMatch(/not reachable/);
  });

  it("treats a missing model as a model-scoped error", async () => {
    const f = (async () => new Response("model not found", { status: 404 })) as unknown as typeof fetch;
    const err = await ollama(f)
      .execute({ model: "llama3.2:3b", prompt: "p", maxOutputTokens: 10 })
      .catch((e) => e);
    expect(err.code).toBe("bad_request");
    expect(err.opts.scope).toBe("model");
  });
});

describe("Ollama discovery", () => {
  const models = localDescriptorsFromTags(OLLAMA_TAGS, { numCtx: 32768 });

  it("registers base models and folds Modelfile aliases into them", () => {
    expect(models.map((m) => m.providerModelId).sort()).toEqual(["gemma4:12b-it-qat", "qwen3.5:9b"]);
    expect(models.find((m) => m.providerModelId === "gemma4:12b-it-qat")!.details?.aliases).toEqual(["gemma-chat:latest"]);
  });
  it("marks local models as zero-cost, no-transfer, restricted-eligible", () => {
    for (const m of models) {
      expect(m.local).toBe(true);
      expect(m.relativeCost).toBe(0);
      expect(m.pricing).toBeNull();
      expect(m.externalDataTransfer).toBe(false);
      expect(m.privacyEligibility).toBe("restricted");
    }
  });
  it("uses the configured num_ctx as the effective context window", () => {
    expect(models[0].contextWindowTokens).toBe(32768);
    expect(models[0].maxContextTokens).toBe(262144);
  });
  it("names models from family metadata", () => {
    expect(models.map((m) => m.displayName).sort()).toEqual(["Gemma 4 12B", "Qwen 3.5 9B"]);
  });
  it("skips embedding-only models and honors the allowlist", () => {
    const withEmbed = [...OLLAMA_TAGS, { name: "nomic-embed-text:latest", model: "nomic-embed-text:latest", size: 1, digest: "x", capabilities: ["embedding"] }];
    expect(localDescriptorsFromTags(withEmbed, { numCtx: 8192 })).toHaveLength(2);
    expect(localDescriptorsFromTags(OLLAMA_TAGS, { numCtx: 8192, allowlist: ["qwen3.5:9b"] }).map((m) => m.providerModelId)).toEqual(["qwen3.5:9b"]);
  });
  it("registers an unknown family (e.g. a newly pulled Llama) with a conservative profile", () => {
    const llama = localDescriptorsFromTags(
      [{ name: "llama3.2:3b", model: "llama3.2:3b", size: 2e9, digest: "d", details: { family: "llama", parameter_size: "3.2B", context_length: 131072 } }],
      { numCtx: 32768 },
    )[0];
    expect(llama.id).toBe("ollama:llama3.2:3b");
    expect(llama.capabilityBasis).toMatch(/Size-based default|Conservative/);
  });
});

describe("AnthropicProvider", () => {
  it("refuses to call the API under the test runner", async () => {
    const p = new AnthropicProvider({ apiKey: "sk-ant-test-key-not-real-0000000000", liveMode: true, timeoutMs: 1000 });
    const err = await p.execute({ model: "claude-haiku-5-5", prompt: "hi", maxOutputTokens: 10 }).catch((e) => e);
    expect(err.code).toBe("live_disabled");
  });
  it("reports simulated health in demo mode without a network call", async () => {
    const p = new AnthropicProvider({ apiKey: "sk-ant-x", liveMode: false, timeoutMs: 1000 });
    expect((await p.health()).status).toBe("simulated");
    expect((await new AnthropicProvider({ apiKey: undefined, liveMode: true, timeoutMs: 1 }).health()).status).toBe("not_configured");
  });
  it("normalizes SDK errors into fallback decisions", () => {
    const err = (status: number) => Anthropic.APIError.generate(status, { error: { message: "x" } }, "x", new Headers());
    expect(normalizeAnthropicError(err(429))).toMatchObject({ code: "rate_limited", opts: { scope: "provider", fallbackEligible: true } });
    expect(normalizeAnthropicError(err(401))).toMatchObject({ code: "auth", opts: { scope: "provider" } });
    expect(normalizeAnthropicError(err(400))).toMatchObject({ code: "bad_request", opts: { fallbackEligible: false } });
    expect(normalizeAnthropicError(err(529))).toMatchObject({ code: "overloaded", opts: { scope: "model" } });
    expect(normalizeAnthropicError(err(503))).toMatchObject({ code: "unavailable", opts: { scope: "provider" } });
    expect(normalizeAnthropicError(new Anthropic.APIConnectionTimeoutError())).toMatchObject({ code: "timeout" });
  });
});

describe("OpenAI and Gemini adapters (mocked HTTP)", () => {
  it("maps an OpenAI chat completion", async () => {
    const f = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: "gpt-test", max_completion_tokens: 50 });
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
      return json({ model: "gpt-test", choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 3 } });
    }) as unknown as typeof fetch;
    const r = await new OpenAIProvider({ apiKey: "sk-test", liveMode: true, timeoutMs: 1000, fetchImpl: f }).execute({ model: "gpt-test", prompt: "p", maxOutputTokens: 50 });
    expect(r).toMatchObject({ text: "ok", stopReason: "end", usage: { inputTokens: 10, outputTokens: 3 } });
  });
  it("maps OpenAI HTTP errors", async () => {
    const f = (async () => new Response("slow down", { status: 429 })) as unknown as typeof fetch;
    const err = await new OpenAIProvider({ apiKey: "k", liveMode: true, timeoutMs: 1000, fetchImpl: f }).execute({ model: "m", prompt: "p", maxOutputTokens: 5 }).catch((e) => e);
    expect(err.code).toBe("rate_limited");
  });
  it("maps a Gemini generateContent response", async () => {
    const f = (async () =>
      json({
        modelVersion: "gemini-test",
        candidates: [{ content: { parts: [{ text: "hi" }, { text: " there" }] }, finishReason: "MAX_TOKENS" }],
        usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2, thoughtsTokenCount: 4 },
      })) as unknown as typeof fetch;
    const r = await new GeminiProvider({ apiKey: "k", liveMode: true, timeoutMs: 1000, fetchImpl: f }).execute({ model: "gemini-test", prompt: "p", maxOutputTokens: 5 });
    expect(r).toMatchObject({ text: "hi there", stopReason: "max_tokens", usage: { inputTokens: 7, outputTokens: 6, reasoningTokens: 4 } });
  });
  it("refuses to run when live mode is off", async () => {
    const f = vi.fn() as unknown as typeof fetch;
    const err = await new GeminiProvider({ apiKey: "k", liveMode: false, timeoutMs: 1000, fetchImpl: f }).execute({ model: "g", prompt: "p", maxOutputTokens: 5 }).catch((e) => e);
    expect(err.code).toBe("live_disabled");
    expect(f).not.toHaveBeenCalled();
  });
});
