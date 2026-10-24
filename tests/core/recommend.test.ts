import { describe, expect, it } from "vitest";
import { classifyTask } from "@/core/classification/classify";
import { evaluateOutput } from "@/core/evaluation/heuristic";
import { recommend, type ComparisonRun } from "@/core/evaluation/recommend";
import { route } from "@/core/routing/engine";
import { getScenario } from "@/scenarios/scenarios";
import { GEMMA, HAIKU, OPUS, QWEN, request } from "../support/fixtures";

const s = getScenario("public-summary")!;
const decision = route(request({ instruction: s.instruction, context: s.context, declaredClassification: "public" }, "balanced"));
const cand = (id: string) => decision.candidates.find((c) => c.modelId === id)!;

function run(id: string, over: Partial<ComparisonRun> = {}): ComparisonRun {
  const c = cand(id);
  return {
    candidate: c,
    status: "completed",
    mode: c.location === "local" ? "local" : "demo",
    evalScore: 90,
    latencyMs: c.latency.totalMs,
    latencySource: c.location === "local" ? "measured" : "estimated",
    costUsd: c.cost.costUsd,
    ...over,
  };
}

describe("comparison recommendation", () => {
  it("returns nothing until something completes", () => {
    expect(recommend([run(GEMMA, { status: "skipped" })], "balanced", "public").modelId).toBeNull();
  });

  it("prefers the local model under Lowest cost when it passes the evaluation bar", () => {
    const r = recommend([run(GEMMA), run(QWEN), run(HAIKU), run(OPUS)], "lowest_cost", "public");
    expect([GEMMA, QWEN]).toContain(r.modelId);
    expect(r.reasons.join(" ")).toMatch(/no external data transfer/);
  });

  it("excludes outputs below the evaluation bar, however cheap", () => {
    const r = recommend([run(GEMMA, { evalScore: 40 }), run(QWEN, { evalScore: 45 }), run(HAIKU, { mode: "live" })], "lowest_cost", "public");
    expect(r.modelId).toBe(HAIKU);
    expect(r.reasons.join(" ")).toMatch(/Excluded below the 70 evaluation bar/);
  });

  it("never recommends a model that was not called", () => {
    const onlySimulated = recommend([run(HAIKU, { evalScore: 100 }), run(OPUS, { status: "estimated" })], "balanced", "public");
    expect(onlySimulated.modelId).toBeNull();
    const mixed = recommend([run(QWEN), run(HAIKU, { evalScore: 100 }), run(OPUS, { status: "estimated" })], "fastest", "public");
    expect(mixed.modelId).toBe(QWEN);
    expect(mixed.ranked.map((x) => x.modelId)).toEqual([QWEN]);
    expect(mixed.reasons.join(" ")).toMatch(/Not called \(DEMO\), shown for reference only/);
  });

  it("uses measured latency rather than the estimate", () => {
    const fast = recommend([run(GEMMA, { latencyMs: 2_000 }), run(HAIKU, { mode: "live" })], "fastest", "public");
    const slow = recommend([run(GEMMA, { latencyMs: 90_000 }), run(HAIKU, { mode: "live" })], "fastest", "public");
    expect(fast.ranked[0].modelId).toBe(GEMMA);
    expect(slow.ranked[0].modelId).toBe(HAIKU);
  });
});

describe("evaluation of structured output", () => {
  it("does not penalize a short, valid JSON extraction", () => {
    const profile = classifyTask({ instruction: "Extract the vendor and total as JSON", context: "Invoice from Halverson Supply, total $4,812.50." });
    const r = evaluateOutput({ instruction: "Extract the vendor and total as JSON", output: '{"vendor": "Halverson Supply", "total": 4812.5}', profile, stopReason: "end" });
    expect(r.score).toBeGreaterThanOrEqual(80);
  });
});

describe("decision snapshot", () => {
  it("records the policy version that produced it", () => {
    expect(decision.policyVersion).toBe(1);
  });
});
