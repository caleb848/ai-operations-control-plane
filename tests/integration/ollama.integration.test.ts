/**
 * Manual integration test against the real local Ollama (no paid APIs).
 *   npm run test:ollama
 * Skips itself when Ollama is not running.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { getScenario } from "@/scenarios/scenarios";
import { OllamaProvider } from "@/providers/ollama/ollama-provider";
import { localDescriptorsFromTags } from "@/providers/ollama/discovery";
import { buildHarness } from "../support/harness";
import { realFetch } from "../support/network-guard";

const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const ollama = new OllamaProvider({ baseUrl, numCtx: 32768, keepAlive: "10m", timeoutMs: 300_000, fetchImpl: realFetch });
let online = false;

beforeAll(async () => {
  online = (await ollama.health()).status === "online";
});

describe.runIf(process.env.RUN_OLLAMA_TESTS === "1")("real Ollama", () => {
  it("is reachable and lists chat-capable models", async () => {
    if (!online) return;
    const tags = await ollama.listModels();
    const models = localDescriptorsFromTags(tags, { numCtx: 32768 });
    console.log("Discovered:", models.map((m) => `${m.providerModelId} (${m.displayName})`).join(", "));
    expect(models.length).toBeGreaterThan(0);
  });

  it("runs a short real inference with thinking off and reports timings", async () => {
    if (!online) return;
    const [model] = localDescriptorsFromTags(await ollama.listModels(), { numCtx: 32768 });
    const r = await ollama.execute({ model: model.providerModelId, prompt: "Reply with exactly: local ok", maxOutputTokens: 20 });
    console.log(`${model.providerModelId}: "${r.text}" · ${r.latencyMs} ms · ${r.timings?.outputTokensPerSec} tok/s · load ${r.timings?.loadMs} ms`);
    expect(r.simulated).toBe(false);
    expect(r.usage.source).toBe("provider");
    expect(r.usage.outputTokens).toBeGreaterThan(0);
  }, 300_000);

  it("executes Scenario 1 end to end on the real local model", async () => {
    if (!online) return;
    const s = getScenario("confidential-client-brief")!;
    const h = buildHarness();
    // Swap the fake Ollama for the real one, keeping everything else in memory.
    (h.registry as unknown as { deps: { ollama: OllamaProvider } }).deps.ollama = ollama;
    (h.executor as unknown as { d: { ollama: OllamaProvider } }).d.ollama = ollama;
    const rec = await h.executor.execute({
      task: { instruction: s.instruction, context: s.context },
      priorityMode: s.priorityMode,
      source: "scenario",
      scenarioId: s.id,
    });
    console.log(rec.trace.map((e) => `+${(e.offsetMs / 1000).toFixed(1)}s ${e.message}${e.detail ? ` — ${e.detail}` : ""}`).join("\n"));
    console.log("\nOUTPUT:\n" + rec.outputText);
    expect(rec.status).toBe("completed");
    expect(rec.mode).toBe("local");
    expect(rec.externalCostUsd).toBe(0);
  }, 300_000);
});
