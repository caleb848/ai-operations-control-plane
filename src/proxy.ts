import { NextResponse, type NextRequest } from "next/server";
import { getDeploymentCapabilities } from "./config/deployment";
import { isAllowedHost, isSameOrigin } from "./server/host-guard";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Local installs: only loopback Host headers (DNS-rebinding protection).
 * Every deployment: API mutations must carry an Origin matching the host.
 * The mode comes from BUILD_DEPLOYMENT_MODE, inlined at build time, so this
 * works even where runtime environment variables aren't visible to the proxy.
 */
export function proxy(request: NextRequest) {
  const caps = getDeploymentCapabilities();
  const host = request.headers.get("host");
  if (caps.loopbackOnly && !isAllowedHost(host)) {
    return new NextResponse("Host not allowed. This control plane only serves localhost; set ALLOWED_HOSTS to add hosts.", { status: 403 });
  }
  if (request.nextUrl.pathname.startsWith("/api/") && MUTATING.has(request.method)) {
    const origin = request.headers.get("origin");
    const ok = isSameOrigin(origin, host) || (!caps.loopbackOnly && isSameOrigin(origin, request.headers.get("x-forwarded-host")));
    if (!ok) return NextResponse.json({ error: "Cross-origin or origin-less mutations are not allowed" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg).*)"],
};
