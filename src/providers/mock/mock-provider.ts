import { estimateTokens } from "@/core/pricing/tokens";
import type { AIProvider, AIRequest, AIResponse, ProviderHealth } from "../types";

/**
 * MockProvider serves cloud-tier models in DEMO mode. Every response it
 * returns is flagged `simulated: true`, its usage is marked "estimated", and
 * its latency is the router's estimate rather than a measurement.
 */

export type OutputResolver = (request: AIRequest) => { text: string; recorded?: AIResponse["recorded"] };

export class MockProvider implements AIProvider {
  readonly id = "mock" as const;
  readonly kind = "simulated" as const;

  constructor(
    private readonly resolve: OutputResolver,
    private readonly opts: { delayMs?: (estimatedMs: number) => number } = {},
  ) {}

  async health(): Promise<ProviderHealth> {
    return { providerId: "mock", status: "simulated", detail: "Simulated responses for DEMO mode", checkedAt: new Date().toISOString() };
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    const estimated = request.simulation?.latencyMs ?? 1200;
    // A short, bounded pause keeps the UI honest about work happening without making demos slow.
    const delay = this.opts.delayMs ? this.opts.delayMs(estimated) : Math.min(1400, 350 + estimated * 0.05);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    const { text, recorded } = this.resolve(request);
    const outputTokens = Math.min(estimateTokens(text), request.maxOutputTokens);
    return {
      text,
      ...(recorded ? { recorded } : {}),
      model: request.model,
      providerId: "mock",
      usage: { inputTokens: estimateTokens(`${request.system ?? ""}${request.prompt}`), outputTokens, reasoningTokens: 0, source: "estimated" },
      latencyMs: estimated,
      stopReason: "end",
      simulated: true,
    };
  }
}
