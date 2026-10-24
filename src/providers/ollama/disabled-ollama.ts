import { PORTFOLIO_EXECUTION_MESSAGE } from "@/config/deployment";
import type { AIResponse, ProviderHealth } from "../types";
import { ProviderError } from "../types";
import type { OllamaRunningModel, OllamaTagModel } from "./ollama-provider";

/**
 * Stands in for OllamaProvider in deployments without local inference
 * (the public portfolio). It has no base URL and makes no network calls:
 * every method either reports "disabled" or refuses.
 */
export class DisabledOllamaProvider {
  readonly id = "ollama" as const;
  readonly kind = "local" as const;
  readonly baseUrl = "";

  async health(): Promise<ProviderHealth> {
    return { providerId: "ollama", status: "offline", detail: "Ollama access is disabled in this deployment", checkedAt: new Date().toISOString() };
  }

  async listModels(): Promise<OllamaTagModel[]> {
    return [];
  }

  async runningModels(): Promise<OllamaRunningModel[]> {
    return [];
  }

  async execute(): Promise<AIResponse> {
    throw new ProviderError("live_disabled", PORTFOLIO_EXECUTION_MESSAGE, { scope: "provider", fallbackEligible: false, preflight: true });
  }
}
