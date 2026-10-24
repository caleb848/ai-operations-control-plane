import { describe, expect, it } from "vitest";
import { classifyTask, countDocuments } from "@/core/classification/classify";
import { maskKey, redact, redactPII, redactSecrets } from "@/core/security/redact";
import { scanSensitivity } from "@/core/security/sensitivity";

describe("sensitivity scan", () => {
  it("finds emails and phone numbers", () => {
    const s = scanSensitivity("Reach dana@corvane.example or (416) 555-0142, or 647-555-0117.");
    expect(s.findings.find((f) => f.kind === "email")?.count).toBe(1);
    expect(s.findings.find((f) => f.kind === "phone")?.count).toBe(2);
    expect(s.detected).toBe("internal");
  });
  it("escalates contact details next to client account details to confidential", () => {
    expect(scanSensitivity("Client: Acme. Account no. 22. Contact: a@b.example").detected).toBe("confidential");
  });
  it("treats an explicit CONFIDENTIAL marking as confidential", () => {
    expect(scanSensitivity("CONFIDENTIAL — board memo").detected).toBe("confidential");
  });
  it("does not escalate ordinary lower-case 'restricted' prose", () => {
    expect(scanSensitivity("Parking is restricted on weekdays.").detected).toBe("public");
  });
  it("detects credentials and marks them restricted", () => {
    const s = scanSensitivity("use key sk-ant-api03-abcdefghijklmnopqrstuvwx to call it");
    expect(s.hasSecrets).toBe(true);
    expect(s.detected).toBe("restricted");
  });
  it("validates payment cards with Luhn", () => {
    expect(scanSensitivity("card 4111 1111 1111 1111").findings.some((f) => f.kind === "payment_card")).toBe(true);
    expect(scanSensitivity("order 4111 1111 1111 1112").findings.some((f) => f.kind === "payment_card")).toBe(false);
  });
  it("detects government IDs and health data as restricted", () => {
    expect(scanSensitivity("SIN 046 454 286").detected).toBe("restricted");
    expect(scanSensitivity("Returned after medical leave").detected).toBe("restricted");
  });
});

describe("redaction", () => {
  it("removes secrets everywhere", () => {
    const out = redactSecrets("Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456 and sk-ant-api03-zzzzzzzzzzzzzzzzzzzzzz");
    expect(out).not.toMatch(/abcdefghijklmnop/);
    expect(out).not.toMatch(/sk-ant-api03-z/);
    expect(out).toContain("[REDACTED");
  });
  it("masks emails, phones and IDs", () => {
    const out = redactPII("dana.whitfield@corvane.example (416) 555-0142 SIN 046 454 286");
    expect(out).toContain("d•••@corvane.example");
    expect(out).toContain("•••-•••-0142");
    expect(out).toContain("[REDACTED ID]");
  });
  it("can keep PII but never secrets", () => {
    expect(redact("a@b.example sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaa", { pii: false })).toBe("a@b.example [REDACTED ANTHROPIC API KEY]");
  });
  it("masks keys for display", () => {
    expect(maskKey("sk-ant-api03-1234567890abcd")).toBe("sk-ant-…abcd");
    expect(maskKey(undefined)).toBeNull();
  });
});

describe("task classifier", () => {
  it("detects task types from the instruction", () => {
    expect(classifyTask({ instruction: "Summarize this memo" }).taskType).toBe("summarization");
    expect(classifyTask({ instruction: "Extract the invoice fields as JSON" }).taskType).toBe("extraction");
    expect(classifyTask({ instruction: "Classify each ticket by urgency" }).taskType).toBe("classification");
    expect(classifyTask({ instruction: "Draft an email to the team" }).taskType).toBe("drafting");
    expect(classifyTask({ instruction: "Recommend a positioning strategy and weigh the trade-offs" }).taskType).toBe("strategic_reasoning");
    expect(classifyTask({ instruction: "Fix the bug in this function" }).taskType).toBe("coding");
  });
  it("defaults unlabeled content to internal, never public", () => {
    const p = classifyTask({ instruction: "Summarize this note", context: "The meeting moved to Tuesday." });
    expect(p.classification).toBe("internal");
    expect(p.classificationReason).toMatch(/defaults to Internal/);
  });
  it("lets a declared label raise the level but not lower it", () => {
    expect(classifyTask({ instruction: "Summarize", context: "Lunch is at noon", declaredClassification: "confidential" }).classification).toBe("confidential");
    const lowered = classifyTask({ instruction: "Summarize", context: "CONFIDENTIAL figures", declaredClassification: "public" });
    expect(lowered.classification).toBe("confidential");
    expect(lowered.classificationReason).toMatch(/raised to Confidential/);
  });
  it("escalates secrets to restricted unless the policy turns that off", () => {
    const task = { instruction: "Debug this config", context: "API_KEY=sk-ant-api03-abcdefghijklmnopqrstuv", declaredClassification: "public" as const };
    expect(classifyTask(task).classification).toBe("restricted");
  });
  it("scores complexity from task type, reasoning cues, size and document count", () => {
    expect(classifyTask({ instruction: "Classify this ticket" }).complexity).toBe("low");
    const hard = classifyTask({
      instruction: "Synthesize the documents, weigh the trade-offs, justify the recommendation and list the risks",
      context: "## A\nx\n## B\ny\n## C\nz",
    });
    expect(hard.complexity).toBe("very_high");
    expect(hard.documentCount).toBe(3);
  });
  it("honors operator overrides", () => {
    const p = classifyTask({ instruction: "Summarize", taskTypeOverride: "coding", complexityOverride: "high" });
    expect(p.taskType).toBe("coding");
    expect(p.complexity).toBe("high");
    expect(p.taskTypeSource).toBe("override");
  });
  it("scores business risk from the output's audience in the instruction", () => {
    expect(classifyTask({ instruction: "Draft answers for our public help center" }).businessRisk).toBe("high");
    expect(classifyTask({ instruction: "Summarize for the account team", context: "the legal team approved it" }).businessRisk).toBe("low");
  });
  it("counts documents by headings", () => {
    expect(countDocuments(undefined)).toBe(0);
    expect(countDocuments("plain text")).toBe(1);
    expect(countDocuments("## One\na\n## Two\nb")).toBe(2);
  });
});
