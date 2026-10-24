/**
 * Automated tests must never call a paid API. Any real network request made
 * through the global fetch fails the test immediately. Providers under test
 * receive an injected fetch instead.
 */
const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  throw new Error(`Network access is blocked in unit tests (attempted: ${url}). Inject a fetch implementation instead.`);
}) as typeof fetch;

export { realFetch };
