import type { AIProvider, AIRequest, AIResponse, ProviderHealth } from "../types";
import { ProviderError } from "../types";

/**
 * Ollama adapter. Talks to the local Ollama HTTP API only; data never leaves
 * the machine. Thinking is disabled for routed work: on this hardware,
 * thinking mode turned 10-second answers into multi-minute waits, and the
 * router's capability profiles assume thinking off.
 */

export interface OllamaConfig {
  baseUrl: string;
  numCtx: number;
  keepAlive: string;
  timeoutMs: number;
  healthTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface OllamaTagModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  modified_at?: string;
  details?: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[] | null;
    parameter_size?: string;
    quantization_level?: string;
    context_length?: number;
  };
  capabilities?: string[];
  /** Present on Ollama cloud models, which run on ollama.com rather than this machine. */
  remote_model?: string;
  remote_host?: string;
}

export interface OllamaRunningModel {
  name: string;
  model: string;
  size_vram?: number;
  expires_at?: string;
  context_length?: number;
}

interface OllamaChatResponse {
  model: string;
  message?: { role: string; content: string };
  done?: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  error?: string;
}

const ns = (n?: number) => (n ? Math.round(n / 1e6) : undefined);

/** What the rest of the app needs from a local runtime (implemented by OllamaProvider and DisabledOllamaProvider). */
export interface LocalRuntime {
  health(): Promise<ProviderHealth>;
  listModels(): Promise<OllamaTagModel[]>;
  runningModels(): Promise<OllamaRunningModel[]>;
  execute(request: AIRequest): Promise<AIResponse>;
}

export class OllamaProvider implements AIProvider, LocalRuntime {
  readonly id = "ollama" as const;
  readonly kind = "local" as const;
  private readonly fetch: typeof fetch;

  constructor(private readonly config: OllamaConfig) {
    this.fetch = config.fetchImpl ?? fetch;
  }

  get baseUrl() {
    return this.config.baseUrl.replace(/\/$/, "");
  }

  private async get<T>(path: string, timeoutMs: number): Promise<T> {
    const res = await this.fetch(`${this.baseUrl}${path}`, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    if (!res.ok) throw new Error(`Ollama ${path} returned HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  async health(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const v = await this.get<{ version: string }>("/api/version", this.config.healthTimeoutMs ?? 1500);
      return {
        providerId: "ollama",
        status: "online",
        detail: `Ollama ${v.version} at ${this.baseUrl}`,
        version: v.version,
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        providerId: "ollama",
        status: "offline",
        detail: `Ollama not reachable at ${this.baseUrl} (${err instanceof Error ? err.message : "unknown error"})`,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async listModels(): Promise<OllamaTagModel[]> {
    const data = await this.get<{ models: OllamaTagModel[] }>("/api/tags", this.config.healthTimeoutMs ?? 1500);
    return data.models ?? [];
  }

  async runningModels(): Promise<OllamaRunningModel[]> {
    const data = await this.get<{ models: OllamaRunningModel[] }>("/api/ps", this.config.healthTimeoutMs ?? 1500);
    return data.models ?? [];
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    const started = Date.now();
    const messages = [
      ...(request.system ? [{ role: "system", content: request.system }] : []),
      { role: "user", content: request.prompt },
    ];

    let res: Response;
    try {
      res = await this.fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(request.timeoutMs ?? this.config.timeoutMs),
        body: JSON.stringify({
          model: request.model,
          messages,
          stream: false,
          think: false,
          keep_alive: this.config.keepAlive,
          options: { num_ctx: this.config.numCtx, num_predict: request.maxOutputTokens },
        }),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new ProviderError(
        timedOut ? "timeout" : "unavailable",
        timedOut ? `Local inference exceeded ${Math.round((request.timeoutMs ?? this.config.timeoutMs) / 1000)} s` : `Ollama not reachable at ${this.baseUrl}`,
        { scope: "provider", fallbackEligible: true },
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const notFound = res.status === 404;
      throw new ProviderError(
        notFound ? "bad_request" : "unavailable",
        notFound ? `Model "${request.model}" is not installed in Ollama` : `Ollama returned HTTP ${res.status}: ${body.slice(0, 160)}`,
        { scope: notFound ? "model" : "provider", fallbackEligible: true, status: res.status },
      );
    }

    const data = (await res.json()) as OllamaChatResponse;
    if (data.error) throw new ProviderError("unknown", `Ollama error: ${data.error}`, { scope: "model", fallbackEligible: true });

    const promptEvalMs = ns(data.prompt_eval_duration);
    const evalMs = ns(data.eval_duration);
    return {
      text: (data.message?.content ?? "").trim(),
      model: data.model ?? request.model,
      providerId: "ollama",
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
        reasoningTokens: 0,
        source: "provider",
      },
      latencyMs: Date.now() - started,
      timings: {
        loadMs: ns(data.load_duration),
        promptEvalMs,
        evalMs,
        promptTokensPerSec: data.prompt_eval_count && promptEvalMs ? Math.round((data.prompt_eval_count / promptEvalMs) * 1000) : undefined,
        outputTokensPerSec: data.eval_count && evalMs ? Math.round((data.eval_count / evalMs) * 10000) / 10 : undefined,
      },
      stopReason: data.done_reason === "length" ? "max_tokens" : data.done_reason === "stop" ? "end" : "other",
      simulated: false,
    };
  }
}
