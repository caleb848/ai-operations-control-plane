/**
 * Exports real local-model outputs from the developer's SQLite history into
 * src/scenarios/recorded-outputs.json, so the public portfolio demo can replay
 * genuine Gemma/Qwen text (labeled as recorded) instead of placeholder prose.
 *
 *   npx tsx scripts/export-recorded-outputs.ts
 *
 * Inclusion rules (the file is committed and published):
 *   - real local executions only (mode = 'local', completed)
 *   - never Restricted data
 *   - skipped if the output contains any personal identifier or credential
 *   - secrets redacted; one output per (input fingerprint, model), newest wins
 */
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/config/env";
import { redactSecrets } from "../src/core/security/redact";
import { scanSensitivity } from "../src/core/security/sensitivity";
import { createHash } from "node:crypto";
import { SCENARIOS } from "../src/scenarios/scenarios";
import { openDatabase } from "../src/services/db/database";
import { buildPrompt } from "../src/services/execution/executor";
import { DEMO_TEMPLATES } from "../src/services/seed/demo-workload";

const config = loadConfig();
const db = openDatabase({ kind: "file", path: path.join(config.dataDir, "control-plane.db") });
const rows = db
  .prepare(
    `SELECT input_sha256, executed_model_id, executed_model_name, created_at, latency_ms, output_tokens, output_tps, output_text, classification
     FROM executions WHERE mode = 'local' AND status = 'completed' AND output_text IS NOT NULL ORDER BY created_at DESC`,
  )
  .all() as Record<string, unknown>[];

// Only prompts the app can still produce: current scenarios and demo-workload templates.
const current = new Set(
  [...SCENARIOS.map((s) => ({ instruction: s.instruction, context: s.context })), ...DEMO_TEMPLATES].map((t) =>
    createHash("sha256").update(buildPrompt(t)).digest("hex"),
  ),
);

const out: Record<string, Record<string, unknown>> = {};
let skipped = 0;
for (const r of rows) {
  const text = String(r.output_text);
  const risky = scanSensitivity(text).findings.some((f) => ["email", "phone", "government_id", "payment_card", "secret", "health"].includes(f.kind));
  if (r.classification === "restricted" || risky || !current.has(String(r.input_sha256))) {
    skipped++;
    continue;
  }
  const model = String(r.executed_model_id).replace(/^ollama:/, "");
  const key = `${r.input_sha256}:${model}`;
  if (out[key]) continue;
  out[key] = {
    model,
    modelName: r.executed_model_name,
    recordedAt: r.created_at,
    latencyMs: r.latency_ms,
    outputTokens: r.output_tokens,
    outputTps: r.output_tps,
    machine: "MacBook Pro (M3 Pro, 18 GB) · Ollama 0.35.1",
    text: redactSecrets(text),
  };
}

const file = path.join(process.cwd(), "src/scenarios/recorded-outputs.json");
fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${Object.keys(out).length} recorded outputs to ${path.relative(process.cwd(), file)} (${skipped} skipped by the inclusion rules).`);
