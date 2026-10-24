import "server-only";
import { getDeploymentCapabilities, PORTFOLIO_EXECUTION_MESSAGE } from "@/config/deployment";
import { redact } from "@/core/security/redact";
import { isAllowedHost, isSameOrigin } from "./host-guard";

/**
 * Route-handler helpers. Mutations must carry an Origin matching the request
 * host. Local installs additionally accept only loopback hosts (DNS-rebinding
 * protection); the public portfolio deployment serves any host but exposes
 * nothing that can spend money or reach a private machine. Errors are
 * redacted before they reach the client or the log.
 */
export function sameOrigin(req: Request): boolean {
  // Defense in depth: the proxy enforces the same rules before the handler runs.
  const caps = getDeploymentCapabilities();
  const host = req.headers.get("host");
  if (caps.loopbackOnly && !isAllowedHost(host)) return false;
  const origin = req.headers.get("origin");
  return isSameOrigin(origin, host) || (!caps.loopbackOnly && isSameOrigin(origin, req.headers.get("x-forwarded-host")));
}

export function forbidden() {
  return Response.json({ error: "Cross-origin requests are not allowed" }, { status: 403 });
}

/** Paid or local execution requested on a deployment that cannot do it. Never falls through to a provider. */
export function executionUnavailable() {
  return Response.json({ error: PORTFOLIO_EXECUTION_MESSAGE, code: "portfolio_mode" }, { status: 403 });
}

export function readOnlyDeployment() {
  return Response.json(
    { error: "Read-only in the portfolio demo. Run the project locally to change governance policy, models or demo data.", code: "portfolio_mode" },
    { status: 403 },
  );
}

/**
 * Per-client fixed-window rate limit for the public deployment (per server
 * instance). Keeps a bot from burning the host's function quota; it is not
 * needed for spend protection, because nothing public can spend.
 */
const windows = new Map<string, { start: number; count: number }>();
export function rateLimit(req: Request, bucket: string, perMinute: number): Response | null {
  if (!getDeploymentCapabilities().publicDeployment) return null;
  const ip = req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start > 60_000) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 5000) windows.clear();
    return null;
  }
  w.count++;
  if (w.count <= perMinute) return null;
  return Response.json({ error: "Too many requests to the demo. Try again in a minute." }, { status: 429, headers: { "Retry-After": "60" } });
}

export async function safely(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    const message = redact(err instanceof Error ? err.message : String(err));
    console.error(`[control-plane] ${message}`);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
