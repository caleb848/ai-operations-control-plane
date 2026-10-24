/**
 * Verifies a running PORTFOLIO deployment from the outside, the way a visitor
 * or an attacker would reach it: plain HTTP, no access to the server.
 *
 *   npm run verify:portfolio -- https://your-site.netlify.app
 *   npm run verify:portfolio -- http://127.0.0.1:3001        # after build:portfolio + start:portfolio
 *
 * Sends only simulated requests (the deployment cannot run anything else) and
 * exits non-zero if any guarantee fails.
 */
import { SCENARIOS } from "../src/scenarios/scenarios";
import { isDeployPreviewHost } from "../src/server/host-guard";

const BASE = (process.argv[2] ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const JSON_HEADERS = { "content-type": "application/json", origin: BASE };
const SECRET_SHAPES = /sk-ant-|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|11434|localhost:11434|ANTHROPIC_API_KEY=/;

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

type Rec = {
  status: string;
  mode: string | null;
  executedModelId: string | null;
  selectedModelId: string | null;
  externalCostUsd: number;
  fallbackUsed: boolean;
  budgetGuard: boolean;
  policyBlocks: number;
  attempts: { mode: string }[];
};

async function post(path: string, body: unknown, headers: Record<string, string> = JSON_HEADERS, method = "POST") {
  const res = await fetch(BASE + path, { method, headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json: { record?: Rec; error?: string } | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON (e.g. an HTML error page) is reported by status alone.
  }
  return { status: res.status, json, text };
}

console.log(`Verifying portfolio deployment at ${BASE}\n`);

// 1. The deployment says it is a portfolio demo, and exposes no secrets or private endpoints.
{
  const res = await fetch(`${BASE}/api/status`);
  const text = await res.text();
  const cfg = JSON.parse(text).config;
  check(res.status === 200 && cfg?.deployment?.mode === "portfolio", "deployment mode is portfolio", cfg?.deployment?.mode);
  check(cfg?.cloudLive === false && cfg?.liveMode === false, "live cloud inference is off");
  check(cfg?.ollamaBaseUrl === null, "no Ollama URL is exposed");
  check(!Object.values(cfg?.providers ?? {}).some(Boolean), "no provider key is configured");
  for (const path of ["/api/status", "/api/models", "/api/budget", "/api/requests"]) {
    const body = await (await fetch(BASE + path)).text();
    check(!SECRET_SHAPES.test(body), `${path} contains no key-shaped strings or Ollama address`);
  }
}

// Preview and draft hosts must not be indexed; the production host must stay indexable.
{
  const robots = (await fetch(`${BASE}/`)).headers.get("x-robots-tag") ?? "";
  if (isDeployPreviewHost(new URL(BASE).host)) check(/noindex/i.test(robots), "preview/draft host sends X-Robots-Tag: noindex", robots || "header missing");
  else check(!/noindex/i.test(robots), "this host is indexable (no noindex header)", robots || "no header");
}

// 2. The six scenarios produce their documented outcomes, all simulated, all at $0.
const expectations: Record<string, (r: Rec) => [boolean, string]> = {
  "confidential-client-brief": (r) => [r.status === "completed" && r.executedModelId?.startsWith("ollama:") === true && r.policyBlocks >= 3, "local, cloud blocked by policy"],
  "public-summary": (r) => [r.status === "completed", "completed"],
  "strategic-positioning": (r) => [r.selectedModelId === "anthropic:claude-sonnet-5-5", "Sonnet selected"],
  "provider-failure": (r) => [r.fallbackUsed && r.executedModelId?.startsWith("ollama:") === true, "outage, governed fallback to local"],
  "budget-exhausted": (r) => [r.budgetGuard && r.executedModelId?.startsWith("ollama:") === true, "Budget Guard rerouted to local"],
  "restricted-local-offline": (r) => [r.status === "blocked" && r.attempts.length === 0, "blocked, fail-closed"],
};
for (const s of SCENARIOS) {
  const t0 = Date.now();
  const { status, json } = await post("/api/execute", {
    instruction: s.instruction,
    context: s.context,
    declaredClassification: s.declaredClassification,
    priorityMode: s.priorityMode,
    scenarioId: s.id,
    simulation: s.simulation,
    permission: s.permission,
    source: "scenario",
  });
  const r = json?.record;
  if (status !== 200 || !r) {
    check(false, `scenario ${s.number} ${s.id}`, `HTTP ${status}`);
    continue;
  }
  const [ok, what] = expectations[s.id]?.(r) ?? [true, ""];
  check(ok, `scenario ${s.number} ${s.id}: ${what}`, `${Date.now() - t0} ms`);
  check(r.externalCostUsd === 0 && r.attempts.every((a) => a.mode === "demo"), `scenario ${s.number}: every attempt simulated, $0 external`);
}

// 3. Nothing a request can say turns on paid or local execution.
const task = { instruction: "Summarize this public announcement in three bullet points.", context: "Acme ships v2.", declaredClassification: "public" };
for (const [label, body] of [
  ["allowLive=true", { ...task, allowLive: true }],
  ["maxLiveCostUsd", { ...task, maxLiveCostUsd: 0.5 }],
] as const) {
  const { status, json } = await post("/api/execute", body);
  check(status >= 400 && !json?.record, `refuses ${label}`, `HTTP ${status}`);
}
for (const [label, body] of [
  ["provider field", { ...task, provider: "anthropic" }],
  ["model field", { ...task, model: "claude-opus-5-5" }],
  ["apiKey field", { ...task, apiKey: "sk-ant-x" }],
  ["extra simulation flag", { ...task, simulation: { forceLive: true } }],
] as const) {
  const { status } = await post("/api/execute", body);
  check(status === 400, `rejects hidden ${label}`, `HTTP ${status}`);
}
{
  const { status, json } = await post("/api/execute", { ...task, pinModelId: "anthropic:claude-opus-5-5" });
  const r = json?.record;
  check(status === 200 && !!r && r.externalCostUsd === 0 && r.attempts.every((a) => a.mode === "demo"), "a pinned Opus request is only simulated");
}
{
  const noOrigin = await post("/api/execute", task, { "content-type": "application/json" });
  check(noOrigin.status === 403, "rejects a mutation without Origin", `HTTP ${noOrigin.status}`);
  const foreign = await post("/api/execute", task, { "content-type": "application/json", origin: "https://attacker.example" });
  check(foreign.status === 403, "rejects a cross-origin mutation", `HTTP ${foreign.status}`);
}

// 4. Configuration and shared demo data are read-only.
for (const [label, path, method, body] of [
  ["policy update", "/api/policy", "PUT", {}],
  ["policy reset", "/api/policy", "DELETE", undefined],
  ["model toggle", "/api/models/anthropic:claude-opus-5-5", "PATCH", { enabled: false }],
  ["demo data reset", "/api/demo", "POST", {}],
  ["budget session reset", "/api/budget", "POST", { action: "reset_session" }],
] as const) {
  const { status } = await post(path, body, JSON_HEADERS, method);
  check(status >= 400 && status !== 500, `refuses ${label}`, `HTTP ${status}`);
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
