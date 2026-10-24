import path from "node:path";
import { capabilitiesFor, resolveDeploymentMode, type DeploymentCapabilities } from "./deployment";

/**
 * Server-side configuration. Read once from process.env; never imported by
 * client components (keys stay on the server).
 *
 * Local mode: paid API calls require two deliberate settings,
 *   AI_LIVE_MODE=true  and  DEFAULT_PROVIDER=live
 * Anything else serves cloud-tier models from MockProvider (DEMO mode).
 * Local Ollama models run for real when Ollama is online.
 *
 * Portfolio mode (public demo): live mode is forced off and provider keys are
 * never read, whatever the environment contains. See ./deployment.ts.
 */

export interface AppConfig {
  deployment: DeploymentCapabilities;
  liveMode: boolean;
  defaultProvider: "mock" | "live";
  /** True only when both switches are on (and never in portfolio mode). */
  cloudLive: boolean;
  sessionBudgetUsd: number;
  lifetimeBudgetUsd: number;
  liveMaxOutputTokens: number;
  /** SQLite directory; ignored in portfolio mode (in-memory database). */
  dataDir: string;
  seedDemoData: boolean;
  ollama: {
    baseUrl: string;
    numCtx: number;
    keepAlive: string;
    timeoutMs: number;
    maxOutputTokens: number;
    models: string[];
  };
  anthropic: { apiKey?: string; timeoutMs: number };
  openai: { apiKey?: string; model?: string; inputPerMTok?: number; outputPerMTok?: number };
  gemini: { apiKey?: string; model?: string; inputPerMTok?: number; outputPerMTok?: number };
  /** Optional public profile links for the portfolio footer (https only). */
  links: { github?: string; linkedin?: string };
  /** Settings present in the environment but ignored because of portfolio mode. */
  ignored: string[];
}

const bool = (v: string | undefined, fallback: boolean) => (v === undefined || v === "" ? fallback : /^(1|true|yes|on)$/i.test(v));
const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : fallback;
};
const optNum = (v: string | undefined) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
const str = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
const httpsUrl = (v: string | undefined) => {
  const s = str(v);
  if (!s) return undefined;
  try {
    return new URL(s).protocol === "https:" ? s : undefined;
  } catch {
    return undefined;
  }
};

const PROVIDER_SECRETS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"] as const;
/** Settings with no effect in portfolio mode (reported at startup so a misconfigured site is visible in the logs). */
const PORTFOLIO_FIXED = ["SESSION_BUDGET_USD", "LIFETIME_BUDGET_USD", "OLLAMA_BASE_URL"] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const { mode, reason } = resolveDeploymentMode(env);
  const deployment = capabilitiesFor(mode, reason);
  const portfolio = mode === "portfolio";

  const requestedLive = bool(env.AI_LIVE_MODE, false);
  const requestedProvider = (env.DEFAULT_PROVIDER ?? "mock").toLowerCase() === "live" ? "live" : "mock";
  const liveMode = portfolio ? false : requestedLive;
  const defaultProvider = portfolio ? "mock" : requestedProvider;

  const ignored: string[] = [];
  if (portfolio) {
    if (requestedLive) ignored.push("AI_LIVE_MODE");
    if (requestedProvider === "live") ignored.push("DEFAULT_PROVIDER");
    for (const k of PROVIDER_SECRETS) if (str(env[k])) ignored.push(k);
    for (const k of PORTFOLIO_FIXED) if (str(env[k])) ignored.push(k);
  }
  // The public demo has no real spend; its budgets are fixed so the scenarios (Budget Guard included) always behave as documented.
  const pinned = (k: "SESSION_BUDGET_USD" | "LIFETIME_BUDGET_USD", fallback: number) => (portfolio ? fallback : num(env[k], fallback));
  // In portfolio mode provider secrets are never read, so no code path can use them.
  const secret = (k: (typeof PROVIDER_SECRETS)[number]) => (portfolio ? undefined : str(env[k]));

  return {
    deployment,
    liveMode,
    defaultProvider,
    cloudLive: deployment.liveCloudInference && liveMode && defaultProvider === "live",
    sessionBudgetUsd: pinned("SESSION_BUDGET_USD", 2),
    lifetimeBudgetUsd: pinned("LIFETIME_BUDGET_USD", 10),
    liveMaxOutputTokens: num(env.LIVE_MAX_OUTPUT_TOKENS, 4000),
    dataDir: env.DATA_DIR ? path.resolve(/*turbopackIgnore: true*/ env.DATA_DIR) : path.join(/*turbopackIgnore: true*/ process.cwd(), "data"),
    seedDemoData: portfolio ? true : bool(env.SEED_DEMO_DATA, true),
    ollama: {
      baseUrl: env.OLLAMA_BASE_URL ?? "http://localhost:11434",
      numCtx: num(env.OLLAMA_NUM_CTX, 32768),
      keepAlive: env.OLLAMA_KEEP_ALIVE ?? "10m",
      timeoutMs: num(env.OLLAMA_TIMEOUT_MS, 240_000),
      maxOutputTokens: num(env.OLLAMA_MAX_OUTPUT_TOKENS, 900),
      models: (env.OLLAMA_MODELS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    },
    anthropic: { apiKey: secret("ANTHROPIC_API_KEY"), timeoutMs: num(env.ANTHROPIC_TIMEOUT_MS, 90_000) },
    openai: {
      apiKey: secret("OPENAI_API_KEY"),
      model: portfolio ? undefined : str(env.OPENAI_MODEL),
      inputPerMTok: optNum(env.OPENAI_INPUT_PRICE_PER_MTOK),
      outputPerMTok: optNum(env.OPENAI_OUTPUT_PRICE_PER_MTOK),
    },
    gemini: {
      apiKey: secret("GEMINI_API_KEY"),
      model: portfolio ? undefined : str(env.GEMINI_MODEL),
      inputPerMTok: optNum(env.GEMINI_INPUT_PRICE_PER_MTOK),
      outputPerMTok: optNum(env.GEMINI_OUTPUT_PRICE_PER_MTOK),
    },
    links: { github: httpsUrl(env.PUBLIC_GITHUB_URL), linkedin: httpsUrl(env.PUBLIC_LINKEDIN_URL) },
    ignored,
  };
}

/** Safe, key-free view of the configuration for the browser. */
export function publicConfig(c: AppConfig) {
  const d = c.deployment;
  return {
    deployment: {
      mode: d.mode,
      publicDeployment: d.publicDeployment,
      localInference: d.localInference,
      liveCloudInference: d.liveCloudInference,
      persistentStorage: d.persistentStorage,
      configurationEditable: d.configurationEditable,
    },
    liveMode: c.liveMode,
    defaultProvider: c.defaultProvider,
    cloudLive: c.cloudLive,
    sessionBudgetUsd: c.sessionBudgetUsd,
    lifetimeBudgetUsd: c.lifetimeBudgetUsd,
    liveMaxOutputTokens: c.liveMaxOutputTokens,
    ollamaBaseUrl: d.ollamaAccess ? c.ollama.baseUrl : null,
    ollamaNumCtx: c.ollama.numCtx,
    links: c.links,
    providers: {
      anthropic: Boolean(c.anthropic.apiKey),
      openai: Boolean(c.openai.apiKey && c.openai.model && c.openai.inputPerMTok !== undefined && c.openai.outputPerMTok !== undefined),
      google: Boolean(c.gemini.apiKey && c.gemini.model && c.gemini.inputPerMTok !== undefined && c.gemini.outputPerMTok !== undefined),
    },
  };
}

export type PublicConfig = ReturnType<typeof publicConfig>;
