import { describe, expect, it } from "vitest";
import { budgetUtilization, checkBudget, remainingBudget } from "@/core/budget/budget";
import { classifyTask } from "@/core/classification/classify";
import { evaluateOutput } from "@/core/evaluation/heuristic";
import { apiCost, estimateCost, formatUsd } from "@/core/pricing/cost";
import { estimateTokens } from "@/core/pricing/tokens";
import { ALL_MODELS, FRESH_BUDGET, GEMMA, HAIKU, OPUS, SONNET } from "../support/fixtures";

const model = (id: string) => ALL_MODELS.find((m) => m.id === id)!;

describe("pricing", () => {
  it("prices tokens at list price per million", () => {
    expect(apiCost(model(SONNET).pricing, 1_000_000, 0)).toBe(2);
    expect(apiCost(model(SONNET).pricing, 0, 1_000_000)).toBe(10);
    expect(apiCost(model(OPUS).pricing, 2000, 500)).toBeCloseTo(0.008 + 0.01);
    expect(apiCost(model(HAIKU).pricing, 2000, 500)).toBeCloseTo(0.0002 + 0.00025);
  });
  it("applies Haiku's long-context tier above 100K input tokens", () => {
    expect(apiCost(model(HAIKU).pricing, 200_000, 0)).toBeCloseTo(0.1);
    expect(apiCost(model(HAIKU).pricing, 100_000, 0)).toBeCloseTo(0.01);
  });
  it("costs local execution $0 and caps local output", () => {
    const est = estimateCost(model(GEMMA), classifyTask({ instruction: "Summarize this", context: "text ".repeat(50) }));
    expect(est.costUsd).toBe(0);
    expect(est.maxCostUsd).toBe(0);
    expect(est.effort).toBeNull();
    expect(est.maxOutputTokens).toBeLessThanOrEqual(900);
  });
  it("adds reasoning tokens for cloud models and reserves a higher worst case", () => {
    const profile = classifyTask({ instruction: "Synthesize, weigh trade-offs, justify and list risks for a strategy", context: "## A\na\n## B\nb" });
    const est = estimateCost(model(SONNET), profile);
    expect(est.effort).toBe("high");
    expect(est.reasoningTokens).toBeGreaterThan(0);
    expect(est.maxCostUsd).toBeGreaterThan(est.costUsd);
    expect(est.maxOutputTokens).toBeLessThanOrEqual(4000);
    expect(est.outputTokens).toBeLessThan(est.maxOutputTokens);
  });
  it("respects the live max-token cap", () => {
    const profile = classifyTask({ instruction: "Synthesize the strategy and weigh the trade-offs", context: "x".repeat(40_000) });
    const est = estimateCost(model(OPUS), profile, { liveMaxOutputTokens: 400, localMaxOutputTokens: 900 });
    expect(est.maxOutputTokens).toBe(400);
  });
  it("formats small amounts without rounding to zero", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.00045)).toBe("$0.00045");
    expect(formatUsd(0.0123)).toBe("$0.01");
    expect(formatUsd(0.0123, { precise: true })).toBe("$0.0123");
    expect(formatUsd(0.00001)).toBe("<$0.0001");
  });
  it("estimates ~4 characters per token", () => {
    expect(estimateTokens("abcd".repeat(100))).toBe(100);
    expect(estimateTokens("")).toBe(0);
  });
});

describe("budget guard", () => {
  it("allows a request whose worst case fits", () => {
    const c = checkBudget(FRESH_BUDGET, 0.05);
    expect(c.allowed).toBe(true);
    expect(c.remainingUsd).toBe(2);
  });
  it("blocks a request whose worst case exceeds the remaining session budget", () => {
    const c = checkBudget({ ...FRESH_BUDGET, sessionActualUsd: 1.99 }, 0.02);
    expect(c.allowed).toBe(false);
    expect(c.limit).toBe("session");
  });
  it("counts simulated spend in the session (demo mode)", () => {
    expect(remainingBudget({ ...FRESH_BUDGET, sessionSimulatedUsd: 1.5 }).remainingUsd).toBeCloseTo(0.5);
  });
  it("uses the tighter of session and lifetime limits", () => {
    const r = remainingBudget({ ...FRESH_BUDGET, lifetimeActualUsd: 9.9 });
    expect(r.limit).toBe("lifetime");
    expect(r.remainingUsd).toBeCloseTo(0.1);
  });
  it("always allows $0 local work", () => {
    expect(checkBudget({ ...FRESH_BUDGET, sessionActualUsd: 2 }, 0).allowed).toBe(true);
  });
  it("reports utilization", () => {
    expect(budgetUtilization({ ...FRESH_BUDGET, sessionActualUsd: 0.5 })).toBeCloseTo(0.25);
  });
});

describe("evaluation estimate", () => {
  const profile = classifyTask({ instruction: "Summarize in three bullet points", context: "Lumen Transit launched arrival alerts on 42 routes with GPS updates every 20 seconds. ".repeat(4) });
  const run = (output: string, stopReason: "end" | "max_tokens" = "end") =>
    evaluateOutput({ instruction: "Summarize in three bullet points", context: profile ? "Lumen Transit launched arrival alerts on 42 routes with GPS updates every 20 seconds. ".repeat(4) : "", output, profile, stopReason });

  it("passes a well-formed, grounded answer", () => {
    const r = run("- Lumen Transit launched arrival alerts on 42 routes.\n- Alerts use GPS updates every 20 seconds.\n- Riders choose their routes and stops for alerts.");
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.checks.find((c) => c.id === "format")!.passed).toBe(true);
  });
  it("penalizes the wrong number of bullets and truncation", () => {
    const r = run("- one point about alerts\n- two\n- three\n- four\n- five\n- six", "max_tokens");
    expect(r.checks.find((c) => c.id === "format")!.passed).toBe(false);
    expect(r.checks.find((c) => c.id === "completed")!.passed).toBe(false);
  });
  it("flags refusals", () => {
    expect(run("I can't help with that request, sorry about that, please ask something else entirely.").checks.find((c) => c.id === "no_refusal")!.passed).toBe(false);
  });
  it("checks JSON validity when JSON is requested", () => {
    const p = classifyTask({ instruction: "Extract the fields as JSON" });
    const good = evaluateOutput({ instruction: "Extract the fields as JSON", output: '```json\n{"a": 1}\n```', profile: p, stopReason: "end" });
    const bad = evaluateOutput({ instruction: "Extract the fields as JSON", output: "{a: 1", profile: p, stopReason: "end" });
    expect(good.checks.find((c) => c.id === "format")!.passed).toBe(true);
    expect(bad.checks.find((c) => c.id === "format")!.passed).toBe(false);
  });
  it("flags contact details echoed from confidential input", () => {
    const p = classifyTask({ instruction: "Summarize", declaredClassification: "confidential" });
    const r = evaluateOutput({ instruction: "Summarize", output: "Email dana@corvane.example for details about the plan and the next steps.", profile: p, stopReason: "end" });
    expect(r.checks.find((c) => c.id === "pii_echo")!.passed).toBe(false);
  });
});
