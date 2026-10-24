/**
 * Host allowlisting for a local, single-operator tool. A DNS-rebinding page
 * reaches the app with its own hostname in the Host header, so requests are
 * accepted only for loopback hosts plus any explicitly configured ALLOWED_HOSTS.
 * Dependency-free so the proxy and route handlers can share it.
 */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function hostname(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1);
  return h.split(":")[0];
}

export function isAllowedHost(hostHeader: string | null, extra: string | undefined = process.env.ALLOWED_HOSTS): boolean {
  const name = hostname(hostHeader);
  if (!name) return false;
  if (LOOPBACK.has(name)) return true;
  const allowed = (extra ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(name);
}

/**
 * Netlify serves every deploy that isn't the live production site on its own
 * `<alias>--<project>.netlify.app` subdomain (draft deploys, Deploy Previews,
 * branch deploys, deploy permalinks). Those get noindex; the production
 * hostname and any custom domain stay indexable, even when a previewed deploy
 * is later published unchanged.
 */
const NETLIFY_DEPLOY_HOST = /^[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/;

export function isDeployPreviewHost(hostHeader: string | null): boolean {
  const name = hostname(hostHeader);
  return name !== null && NETLIFY_DEPLOY_HOST.test(name);
}

/** Mutations must carry an Origin whose host:port equals the request's Host. */
export function isSameOrigin(originHeader: string | null, hostHeader: string | null): boolean {
  if (!originHeader || !hostHeader) return false;
  try {
    return new URL(originHeader).host.toLowerCase() === hostHeader.trim().toLowerCase();
  } catch {
    return false;
  }
}
