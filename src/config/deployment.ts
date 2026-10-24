/**
 * Deployment modes.
 *
 *   local      The developer's machine. Real Ollama inference, optional paid
 *              cloud calls (still behind the two live-mode switches), SQLite file.
 *   portfolio  The public demo. Routing, governance and budget logic are real;
 *              every model execution is simulated. No Ollama, no paid APIs, no
 *              provider keys read, nothing persisted beyond the server instance.
 *
 * Portfolio mode wins whenever ANY signal asks for it, so a misconfigured
 * public deployment fails closed instead of open:
 *   - BUILD_DEPLOYMENT_MODE inlined at build time by next.config.ts
 *   - DEPLOYMENT_MODE at runtime
 *   - a hosted environment (Netlify, Vercel, AWS Lambda, Cloudflare Pages)
 *   - an unrecognized DEPLOYMENT_MODE value
 */

export type DeploymentMode = "local" | "portfolio";

export interface DeploymentCapabilities {
  mode: DeploymentMode;
  /** Why this mode was chosen (shown in logs and the Budget page). */
  reason: string;
  publicDeployment: boolean;
  /** May contact Ollama at all (discovery, health, inference). */
  ollamaAccess: boolean;
  /** Local models execute for real. */
  localInference: boolean;
  /** Paid cloud calls are possible in principle (still need AI_LIVE_MODE + DEFAULT_PROVIDER=live). */
  liveCloudInference: boolean;
  /** MockProvider is available. Always true. */
  simulatedInference: true;
  /** History is written to a SQLite file (false = in-memory, per server instance). */
  persistentStorage: boolean;
  /** Governance policy and model registry can be edited. */
  configurationEditable: boolean;
  /** Demo data can be cleared / regenerated through the API. */
  demoDataReset: boolean;
  /** Only loopback Host headers are accepted (DNS-rebinding protection for local installs). */
  loopbackOnly: boolean;
}

export const PORTFOLIO_EXECUTION_MESSAGE =
  "Execution unavailable in Portfolio Mode. This public deployment uses simulated providers only. Run the project locally to use real local or cloud models.";

const HOSTED_SIGNALS = ["NETLIFY", "VERCEL", "AWS_LAMBDA_FUNCTION_NAME", "CF_PAGES"] as const;

export function resolveDeploymentMode(env: NodeJS.ProcessEnv = process.env): { mode: DeploymentMode; reason: string } {
  const runtime = env.DEPLOYMENT_MODE?.trim().toLowerCase();
  // Inlined at build time via next.config.ts `env`; undefined outside a Next build (e.g. tests, scripts).
  const build = process.env.BUILD_DEPLOYMENT_MODE;
  const hosted = HOSTED_SIGNALS.find((k) => env[k]);

  if (build === "portfolio") return { mode: "portfolio", reason: "built with DEPLOYMENT_MODE=portfolio" };
  if (runtime === "portfolio") return { mode: "portfolio", reason: "DEPLOYMENT_MODE=portfolio" };
  if (hosted) return { mode: "portfolio", reason: `hosted environment detected (${hosted})` };
  if (runtime && runtime !== "local") return { mode: "portfolio", reason: `unrecognized DEPLOYMENT_MODE "${runtime}" (failing closed)` };
  return { mode: "local", reason: runtime === "local" ? "DEPLOYMENT_MODE=local" : "default (local machine)" };
}

export function capabilitiesFor(mode: DeploymentMode, reason: string): DeploymentCapabilities {
  if (mode === "portfolio") {
    return {
      mode,
      reason,
      publicDeployment: true,
      ollamaAccess: false,
      localInference: false,
      liveCloudInference: false,
      simulatedInference: true,
      persistentStorage: false,
      configurationEditable: false,
      demoDataReset: false,
      loopbackOnly: false,
    };
  }
  return {
    mode,
    reason,
    publicDeployment: false,
    ollamaAccess: true,
    localInference: true,
    liveCloudInference: true,
    simulatedInference: true,
    persistentStorage: true,
    configurationEditable: true,
    demoDataReset: true,
    loopbackOnly: true,
  };
}

/** The single answer to "what may this deployment do". */
export function getDeploymentCapabilities(env: NodeJS.ProcessEnv = process.env): DeploymentCapabilities {
  const { mode, reason } = resolveDeploymentMode(env);
  return capabilitiesFor(mode, reason);
}
