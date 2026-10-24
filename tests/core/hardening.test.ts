import { describe, expect, it } from "vitest";
import { classifyTask } from "@/core/classification/classify";
import { evaluateOutput } from "@/core/evaluation/heuristic";
import { evaluatePolicy } from "@/core/governance/evaluate";
import { DEFAULT_POLICY, validatePolicy } from "@/core/governance/policy";
import { route } from "@/core/routing/engine";
import { redactPII, redactSecrets } from "@/core/security/redact";
import { isLoopbackUrl, isRemoteOllamaModel, localDescriptorsFromTags } from "@/providers/ollama/discovery";
import { isAllowedHost, isSameOrigin } from "@/server/host-guard";
import { getScenario } from "@/scenarios/scenarios";
import { availability, FRESH_BUDGET, HAIKU, OLLAMA_TAGS, OPUS, request, SONNET } from "../support/fixtures";

describe("Ollama cloud models are never treated as on-device", () => {
  const cloudTag = { name: "gpt-oss:120b-cloud", model: "gpt-oss:120b-cloud", size: 384, digest: "x", remote_model: "gpt-oss:120b", remote_host: "https://ollama.com:443", details: { family: "gptoss" } };

  it("skips remote / -cloud tags during discovery", () => {
    expect(isRemoteOllamaModel(cloudTag)).toBe(true);
    expect(isRemoteOllamaModel({ ...cloudTag, remote_host: undefined, remote_model: undefined })).toBe(true);
    const models = localDescriptorsFromTags([...OLLAMA_TAGS, cloudTag], { numCtx: 32768 });
    expect(models.map((m) => m.providerModelId)).not.toContain("gpt-oss:120b-cloud");
    expect(models).toHaveLength(2);
  });

  it("registers nothing as local when Ollama is not on this machine", () => {
    expect(isLoopbackUrl("http://localhost:11434")).toBe(true);
    expect(isLoopbackUrl("http://127.0.0.1:11434")).toBe(true);
    expect(isLoopbackUrl("http://[::1]:11434")).toBe(true);
    expect(isLoopbackUrl("http://10.0.0.5:11434")).toBe(false);
    expect(isLoopbackUrl("https://ollama.example.com")).toBe(false);
    expect(localDescriptorsFromTags(OLLAMA_TAGS, { numCtx: 32768, loopback: false })).toHaveLength(0);
  });
});

describe("governance guardrails", () => {
  it("rejects a policy that drops Confidential's explicit-permission rule", () => {
    const p = structuredClone(DEFAULT_POLICY);
    p.rules.confidential.cloudAccess = "approved_providers";
    expect(validatePolicy(p).join(" ")).toMatch(/Confidential data may reach cloud only with explicit permission/);
    p.rules.confidential.cloudAccess = "prohibited";
    expect(validatePolicy(p)).toEqual([]);
  });

  it("redacts secrets inside a permission justification", () => {
    const sonnet = request({ instruction: "x", declaredClassification: "confidential" }, "balanced").models.find((m) => m.id === SONNET)!;
    const v = evaluatePolicy(sonnet, "confidential", DEFAULT_POLICY, { granted: true, justification: "approved, key sk-ant-api03-abcdefghijklmnopqrstuv" });
    expect(v.reasons[0].message).not.toContain("sk-ant-api03");
  });
});

describe("sensitive formats the first version missed", () => {
  const cls = (text: string) => classifyTask({ instruction: "Summarize", context: text, declaredClassification: "public" }).classification;
  it("detects an unseparated SSN or SIN next to its keyword", () => {
    expect(cls("Applicant SSN 123456789 on file")).toBe("restricted");
    expect(cls("SIN: 046454286")).toBe("restricted");
    expect(cls("Order 123456789 shipped")).toBe("public");
  });
  it("detects credential assignments and JWTs", () => {
    expect(cls("db_password=hunter2hunter2")).toBe("restricted");
    expect(cls("api_key: 0123456789abcdef0123456789abcdef")).toBe("restricted");
    expect(cls("Authorization uses eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U")).toBe("restricted");
  });
  it("redacts them, and masks payment cards in stored previews", () => {
    expect(redactSecrets("db_password=hunter2hunter2")).not.toContain("hunter2");
    expect(redactPII("card 4111 1111 1111 1111 ok")).toBe("card [REDACTED CARD] ok");
    expect(redactPII("order 4111 1111 1111 1112")).toContain("4111");
    expect(redactPII("SSN 123456789")).toBe("[REDACTED ID]");
  });
  it("flags a government ID echoed in a restricted output", () => {
    const profile = classifyTask({ instruction: "Summarize the payroll report", context: "RESTRICTED. Employee SIN 130 692 544 flagged." });
    const r = evaluateOutput({ instruction: "Summarize the payroll report", output: "Employee SIN 130 692 544 has a duplicate deposit that needs reversal before the next run.", profile, stopReason: "end" });
    expect(r.checks.find((c) => c.id === "pii_echo")!.passed).toBe(false);
  });
});

describe("budget guard alternatives", () => {
  it("reroutes to the cheapest capable cloud model that fits when no local model can take it", () => {
    const s = getScenario("public-summary")!;
    const task = { instruction: s.instruction, context: s.context, declaredClassification: "public" as const };
    const offline = availability({ ollama: false });
    const free = route(request(task, "best_quality", { availability: offline }));
    expect(free.selectedModelId).toBe(OPUS);
    const opus = free.candidates.find((c) => c.modelId === OPUS)!;
    const sonnet = free.candidates.find((c) => c.modelId === SONNET)!;
    // Room for Sonnet and Haiku, not Opus. Before the fix the guard took the higher-scoring Sonnet.
    const remaining = (opus.cost.maxCostUsd + sonnet.cost.maxCostUsd) / 2;
    const d = route(request(task, "best_quality", { availability: offline, budget: { ...FRESH_BUDGET, sessionSimulatedUsd: FRESH_BUDGET.sessionBudgetUsd - remaining } }));
    expect(d.budgetGuard?.triggered).toBe(true);
    expect(d.selectedModelId).toBe(HAIKU);
    expect(d.candidates.find((c) => c.modelId === SONNET)!.reasons.map((r) => r.code)).toContain("budget_prefers");
  });
});

describe("host guard (DNS rebinding)", () => {
  it("accepts loopback hosts and explicit extras only", () => {
    expect(isAllowedHost("127.0.0.1:3000", "")).toBe(true);
    expect(isAllowedHost("localhost:3000", "")).toBe(true);
    expect(isAllowedHost("[::1]:3000", "")).toBe(true);
    expect(isAllowedHost("attacker.example:3000", "")).toBe(false);
    expect(isAllowedHost(null, "")).toBe(false);
    expect(isAllowedHost("ops.internal:3000", "ops.internal")).toBe(true);
  });
  it("requires an Origin that matches the Host for mutations", () => {
    expect(isSameOrigin("http://127.0.0.1:3000", "127.0.0.1:3000")).toBe(true);
    expect(isSameOrigin(null, "127.0.0.1:3000")).toBe(false);
    expect(isSameOrigin("http://evil.example", "127.0.0.1:3000")).toBe(false);
  });
});
