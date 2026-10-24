import { describe, expect, it } from "vitest";
import { evaluatePolicy, requiresLocal } from "@/core/governance/evaluate";
import { DEFAULT_POLICY, validatePolicy } from "@/core/governance/policy";
import { reviewRequirement } from "@/core/governance/review";
import { configuredCloudModel } from "@/core/models/cloud-catalog";
import { classifyTask } from "@/core/classification/classify";
import type { GovernancePolicy } from "@/core/types";
import { ALL_MODELS, GEMMA, SONNET } from "../support/fixtures";

const sonnet = ALL_MODELS.find((m) => m.id === SONNET)!;
const gemma = ALL_MODELS.find((m) => m.id === GEMMA)!;
const openai = configuredCloudModel({ providerId: "openai", modelId: "gpt-test", inputPerMTok: 1, outputPerMTok: 4 });

describe("local vs cloud eligibility", () => {
  it("allows local models for every classification", () => {
    for (const c of ["public", "internal", "confidential", "restricted"] as const) {
      expect(evaluatePolicy(gemma, c, DEFAULT_POLICY).allowed).toBe(true);
    }
  });
  it("PUBLIC: any configured cloud provider", () => {
    expect(evaluatePolicy(sonnet, "public", DEFAULT_POLICY).allowed).toBe(true);
    expect(evaluatePolicy(openai, "public", DEFAULT_POLICY).allowed).toBe(true);
  });
  it("INTERNAL: approved providers only", () => {
    expect(evaluatePolicy(sonnet, "internal", DEFAULT_POLICY).allowed).toBe(true);
    const v = evaluatePolicy(openai, "internal", DEFAULT_POLICY);
    expect(v.allowed).toBe(false);
    expect(v.reasons[0].code).toBe("provider_not_approved");
  });
  it("CONFIDENTIAL: cloud only with explicit, justified permission", () => {
    expect(evaluatePolicy(sonnet, "confidential", DEFAULT_POLICY).reasons[0].code).toBe("permission_required");
    expect(evaluatePolicy(sonnet, "confidential", DEFAULT_POLICY, { granted: true, justification: "" }).allowed).toBe(false);
    const ok = evaluatePolicy(sonnet, "confidential", DEFAULT_POLICY, { granted: true, justification: "DPA signed 2026-09-01" });
    expect(ok.allowed).toBe(true);
    expect(ok.reasons[0].severity).toBe("warn");
  });
  it("CONFIDENTIAL: a model's own privacy ceiling still applies", () => {
    const v = evaluatePolicy(openai, "confidential", DEFAULT_POLICY, { granted: true, justification: "ok" });
    expect(v.allowed).toBe(false);
    expect(v.reasons[0].code).toBe("model_not_approved");
  });
  it("RESTRICTED: local only, even with a permission", () => {
    const v = evaluatePolicy(sonnet, "restricted", DEFAULT_POLICY, { granted: true, justification: "please" });
    expect(v.allowed).toBe(false);
    expect(v.reasons[0].code).toBe("cloud_prohibited");
  });
  it("knows when policy leaves only local execution", () => {
    expect(requiresLocal(DEFAULT_POLICY, "restricted")).toBe(true);
    expect(requiresLocal(DEFAULT_POLICY, "confidential")).toBe(true);
    expect(requiresLocal(DEFAULT_POLICY, "confidential", { granted: true, justification: "x" })).toBe(false);
    expect(requiresLocal(DEFAULT_POLICY, "public")).toBe(false);
  });
});

describe("policy validation (guardrails the UI cannot relax)", () => {
  const edit = (fn: (p: GovernancePolicy) => void) => {
    const p = structuredClone(DEFAULT_POLICY);
    fn(p);
    return validatePolicy(p);
  };
  it("accepts the default policy", () => expect(validatePolicy(DEFAULT_POLICY)).toEqual([]));
  it("keeps restricted data local-only", () => expect(edit((p) => (p.rules.restricted.cloudAccess = "allowed"))).not.toEqual([]));
  it("keeps human review on restricted outputs", () => expect(edit((p) => (p.rules.restricted.requireHumanReview = false))).not.toEqual([]));
  it("rejects a higher classification with looser access", () => {
    expect(edit((p) => (p.rules.confidential.cloudAccess = "allowed"))).toContain("confidential cannot have looser cloud access than internal.");
  });
});

describe("human review rules", () => {
  const base = { policy: DEFAULT_POLICY, qualityThresholdMet: true, fallbackUsed: false, cloudPermissionUsed: false };
  const evalOf = (score: number) => ({ score, method: "heuristic" as const, checks: [] });

  it("requires review for confidential data", () => {
    const r = reviewRequirement({ ...base, profile: classifyTask({ instruction: "x", declaredClassification: "confidential" }), evaluation: evalOf(95) });
    expect(r.required).toBe(true);
    expect(r.reasons[0].code).toBe("classification");
  });
  it("requires review below the evaluation threshold", () => {
    const r = reviewRequirement({ ...base, profile: classifyTask({ instruction: "Summarize", declaredClassification: "public" }), evaluation: evalOf(55) });
    expect(r.reasons.map((x) => x.code)).toEqual(["low_evaluation"]);
  });
  it("requires review for high business risk and threshold misses", () => {
    const r = reviewRequirement({
      ...base,
      qualityThresholdMet: false,
      profile: classifyTask({ instruction: "Draft a reply to the customer", declaredClassification: "public" }),
      evaluation: evalOf(90),
    });
    expect(r.reasons.map((x) => x.code)).toEqual(["business_risk", "threshold_miss"]);
  });
  it("does not require review for routine public work", () => {
    const r = reviewRequirement({ ...base, profile: classifyTask({ instruction: "Summarize", declaredClassification: "public" }), evaluation: evalOf(90) });
    expect(r.required).toBe(false);
  });
  it("flags cloud use under a policy exception", () => {
    const r = reviewRequirement({ ...base, cloudPermissionUsed: true, profile: classifyTask({ instruction: "x", declaredClassification: "public" }), evaluation: evalOf(90) });
    expect(r.reasons[0].code).toBe("cloud_permission");
  });
});
