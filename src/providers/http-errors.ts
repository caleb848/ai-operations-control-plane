import { ProviderError } from "./types";
import { redactSecrets } from "@/core/security/redact";

/** Shared HTTP → ProviderError mapping for fetch-based cloud adapters. */
export async function httpErrorToProviderError(vendor: string, res: Response): Promise<ProviderError> {
  const body = redactSecrets((await res.text().catch(() => "")).slice(0, 200));
  const s = res.status;
  if (s === 401 || s === 403) return new ProviderError("auth", `${vendor} rejected the API key`, { scope: "provider", fallbackEligible: true, status: s });
  if (s === 429) return new ProviderError("rate_limited", `${vendor} rate limit reached`, { scope: "provider", fallbackEligible: true, status: s });
  if (s === 400 || s === 404 || s === 422) {
    return new ProviderError("bad_request", `${vendor} rejected the request (${s}): ${body}`, { scope: "model", fallbackEligible: false, status: s });
  }
  if (s === 529 || s === 503) return new ProviderError("overloaded", `${vendor} is overloaded (${s})`, { scope: "provider", fallbackEligible: true, status: s });
  return new ProviderError("unavailable", `${vendor} API error ${s}`, { scope: "provider", fallbackEligible: true, status: s });
}

export function networkErrorToProviderError(vendor: string, err: unknown): ProviderError {
  const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
  return new ProviderError(timedOut ? "timeout" : "unavailable", timedOut ? `${vendor} request timed out` : `Could not reach the ${vendor} API`, {
    scope: "provider",
    fallbackEligible: true,
  });
}
