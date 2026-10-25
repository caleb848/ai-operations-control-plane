import { describe, expect, it } from "vitest";
import { route } from "@/core/routing/engine";
import type { RoutingDecision, TaskInput } from "@/core/types";
import { reviewOf, routeOf, routeOfRecord, SCENARIO_STORY, stagesOf, valueTakeaways, whyOf } from "@/lib/routing-view";
import { getScenario, SCENARIOS } from "@/scenarios/scenarios";
import { ALL_MODELS, availability, FRESH_BUDGET, request } from "../support/fixtures";

/*
 * The presentation layer explains decisions; it must never contradict them.
 * These tests plan every built-in scenario with the real engine, applying the
 * scenario's simulation the way the route console does, and check that the
 * story cards, stages and reasons say what the engine actually decided.
 */

function decisionFor(id: string): RoutingDecision {
  const s = getScenario(id)!;
  const task: TaskInput = { instruction: s.instruction, context: s.context, declaredClassification: s.declaredClassification };
  const sim = s.simulation ?? {};
  return route(
    request(task, s.priorityMode, {
      ...(sim.ollamaOffline ? { availability: availability({ ollama: false }) } : {}),
      ...(sim.sessionSpendUsd !== undefined ? { budget: { ...FRESH_BUDGET, sessionSimulatedUsd: sim.sessionSpendUsd, simulated: true } } : {}),
    }),
  );
}

const isLocal = (id: string) => ALL_MODELS.find((m) => m.id === id)?.local === true;

describe("scenario story cards match the engine", () => {
  for (const s of SCENARIOS) {
    it(`${s.id}: destination and classification`, () => {
      const story = SCENARIO_STORY[s.id];
      expect(story, `missing story for ${s.id}`).toBeDefined();
      const d = decisionFor(s.id);
      expect(routeOf(d)).toBe(story.destination);
      expect(d.profile.classification).toBe(story.classification);
    });
  }

  it("confidential brief: stays local, then a person reviews it", () => {
    const d = decisionFor("confidential-client-brief");
    expect(SCENARIO_STORY["confidential-client-brief"].then).toBe("review");
    const review = reviewOf(d);
    expect(review.required).toBe(true);
    expect(review.certain).toBe(true);
  });

  it("provider failure: the second stop is a local model in the fallback chain", () => {
    const d = decisionFor("provider-failure");
    expect(SCENARIO_STORY["provider-failure"].then).toBe("local");
    expect(d.fallbackChain.some(isLocal)).toBe(true);
  });
});

describe("stages", () => {
  it("name policy blocks and Budget Guard where they happen", () => {
    const confidential = stagesOf(decisionFor("confidential-client-brief"));
    expect(confidential.find((s) => s.key === "policy")).toMatchObject({ value: "Cloud blocked", tone: "blocked" });

    const budget = stagesOf(decisionFor("budget-exhausted"));
    expect(budget.find((s) => s.key === "economics")).toMatchObject({ value: "Budget Guard", tone: "review" });

    const restricted = stagesOf(decisionFor("restricted-local-offline"));
    expect(restricted.find((s) => s.key === "policy")).toMatchObject({ value: "Local only", tone: "blocked" });
    expect(restricted.find((s) => s.key === "capability")).toMatchObject({ value: "No local model online", tone: "blocked" });
    expect(restricted.find((s) => s.key === "economics")?.value).toBe("Nothing spent");
  });
});

describe("why this route", () => {
  it("leads with the reason that decided it", () => {
    expect(whyOf(decisionFor("confidential-client-brief"))[0].code).toBe("local_ok");
    expect(whyOf(decisionFor("budget-exhausted"))[0].code).toBe("budget_guard");
    expect(whyOf(decisionFor("restricted-local-offline"))[0].code).toBe("local_required_unavailable");
    expect(whyOf(decisionFor("public-summary"))[0].code).toBe("score");
  });

  it("keeps the engine's exact message as each line's detail", () => {
    const d = decisionFor("strategic-positioning");
    for (const item of whyOf(d, 10)) expect(d.rationale.map((r) => r.message)).toContain(item.detail);
  });

  it("never claims review for a blocked request", () => {
    const review = reviewOf(decisionFor("restricted-local-offline"));
    expect(review.required).toBe(false);
  });
});

describe("value lessons", () => {
  it("public summary: free loses on value, and the strongest model isn't worth its price", () => {
    const [free, intelligence] = valueTakeaways(decisionFor("public-summary"));
    expect(free.title).toBe("Free isn't automatically best");
    expect(intelligence.title).toBe("More intelligence isn't always more value");
  });

  it("strategic positioning: local falls below the bar", () => {
    const [free] = valueTakeaways(decisionFor("strategic-positioning"));
    expect(free.title).toBe("Free isn't automatically best");
    expect(free.body).toMatch(/costs \$0 but scores \d+ against a bar of \d+/);
  });

  it("confidential brief: policy, not price, keeps it local", () => {
    const [first] = valueTakeaways(decisionFor("confidential-client-brief"));
    expect(first.title).toBe("Policy keeps this one local");
  });

  it("blocked requests have no lessons to draw", () => {
    expect(valueTakeaways(decisionFor("restricted-local-offline"))).toEqual([]);
  });
});

describe("routeOfRecord", () => {
  it("reports where a finished request actually ended up", () => {
    expect(routeOfRecord({ status: "blocked", location: null })).toBe("blocked");
    expect(routeOfRecord({ status: "failed", location: "cloud" })).toBe("failed");
    expect(routeOfRecord({ status: "completed", location: "local" })).toBe("local");
    expect(routeOfRecord({ status: "completed", location: "cloud" })).toBe("cloud");
  });
});
