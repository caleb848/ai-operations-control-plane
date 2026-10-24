/**
 * Regenerates the seeded demo workload (rows with source = "seed").
 * Real executions, approvals on them, the ledger and settings are untouched.
 *
 *   npm run seed:reset            # clear and reseed
 *   npm run seed:reset -- --clear # clear only
 */
import path from "node:path";
import { loadConfig } from "../src/config/env";
import { OllamaProvider } from "../src/providers/ollama/ollama-provider";
import { ApprovalService } from "../src/services/approvals/approvals";
import { openDatabase } from "../src/services/db/database";
import { ExecutionRepository } from "../src/services/observability/repository";
import { ModelRegistry } from "../src/services/registry/model-registry";
import { seedDemoWorkload } from "../src/services/seed/demo-workload";
import { SettingsStore } from "../src/services/settings/settings-store";

async function main() {
  const config = loadConfig();
  if (!config.deployment.persistentStorage) {
    console.log(`Portfolio mode (${config.deployment.reason}): demo data lives in memory and is seeded on start. Nothing to reset.`);
    return;
  }
  const db = openDatabase({ kind: "file", path: path.join(config.dataDir, "control-plane.db") });
  const executions = new ExecutionRepository(db);
  const approvals = new ApprovalService(db, executions);
  const settings = new SettingsStore(db);

  const removed = executions.deleteSeed();
  console.log(`Removed ${removed} seeded demo requests.`);
  if (process.argv.includes("--clear")) return;

  const ollama = new OllamaProvider({
    baseUrl: config.ollama.baseUrl,
    numCtx: config.ollama.numCtx,
    keepAlive: config.ollama.keepAlive,
    timeoutMs: config.ollama.timeoutMs,
  });
  const registry = new ModelRegistry({ config, ollama, settings, executions, db });
  const snap = await registry.snapshot();
  const created = seedDemoWorkload({ executions, approvals, policy: settings.policy(), models: snap.models });
  console.log(`Seeded ${created} demo requests (local models: ${snap.models.filter((m) => m.local).map((m) => m.displayName).join(", ") || "none discovered"}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
