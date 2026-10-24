import { classificationRank } from "../security/classification";
import { scanSensitivity } from "../security/sensitivity";
import type { EvaluationCheck, EvaluationResult, TaskProfile } from "../types";

/**
 * Evaluation Estimate: deterministic output checks that cost nothing and run
 * on every execution. It is a screening signal, not a quality benchmark.
 * LLM-as-judge is deliberately off by default to protect the API budget.
 */

export interface EvaluationInput {
  instruction: string;
  context?: string;
  output: string;
  profile: TaskProfile;
  stopReason: "end" | "max_tokens" | "refusal" | "other";
}

const STOPWORDS = new Set(
  "about above after again against because before being below between could doing during further having other their there these those through under until which while would should where what with from into this that will your they them than then were have been also more most such only".split(
    " ",
  ),
);

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z][a-z'-]+/g) ?? [];
}

function contentTerms(text: string): Set<string> {
  return new Set(words(text).filter((w) => w.length >= 5 && !STOPWORDS.has(w)));
}

const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, ten: 10 };

function requestedCount(instruction: string): number | null {
  const m = instruction.match(/\b(\d+|two|three|four|five|six|seven|eight|ten)\s+(?:bullet|bullets|points|items|takeaways|risks|questions|options)\b/i);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  return NUMBER_WORDS[raw] ?? Number(raw);
}

function bulletLines(output: string): number {
  return output.split("\n").filter((l) => /^\s*(?:[-*•]|\d+[.)])\s+\S/.test(l)).length;
}

export function evaluateOutput(input: EvaluationInput): EvaluationResult {
  const { output, instruction, profile } = input;
  const checks: EvaluationCheck[] = [];
  const outWords = words(output).length;
  // Structured outputs (JSON fields, labels) are short by design; prose length rules don't apply.
  const structured = profile.taskType === "extraction" || profile.taskType === "classification";

  checks.push({
    id: "non_empty",
    label: "Substantive answer",
    weight: 20,
    passed: outWords >= 15 || (structured && outWords >= 1),
    detail: `${outWords} words`,
  });

  checks.push({
    id: "completed",
    label: "Not truncated",
    weight: 15,
    passed: input.stopReason === "end",
    detail: input.stopReason === "end" ? "Model finished naturally" : `Stopped: ${input.stopReason}`,
  });

  const expectedWords = profile.expectedOutputTokens * 0.75;
  const ratio = outWords / Math.max(1, expectedWords);
  checks.push({
    id: "length_fit",
    label: "Length fits the task",
    weight: 15,
    passed: ratio >= (structured ? 0.05 : 0.25) && ratio <= 2.5,
    detail: `${outWords} words vs ~${Math.round(expectedWords)} expected`,
  });

  const wantsJson = /\bjson\b/i.test(instruction);
  const wantsList = /\b(?:bullet|bulleted|list|points)\b/i.test(instruction);
  const count = requestedCount(instruction);
  if (wantsJson) {
    const body = output.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    let ok = false;
    try {
      JSON.parse(body);
      ok = true;
    } catch {
      ok = false;
    }
    checks.push({ id: "format", label: "Valid JSON", weight: 20, passed: ok, detail: ok ? "Parses as JSON" : "Does not parse as JSON" });
  } else if (wantsList || count) {
    const n = bulletLines(output);
    const ok = count ? Math.abs(n - count) <= 1 && n > 0 : n >= 2;
    checks.push({
      id: "format",
      label: "Requested structure",
      weight: 20,
      passed: ok,
      detail: count ? `${n} list items (asked for ${count})` : `${n} list items`,
    });
  }

  if (input.context && input.context.trim().length > 200) {
    const source = contentTerms(input.context);
    const terms = [...contentTerms(output)];
    const grounded = terms.filter((t) => source.has(t)).length;
    const share = terms.length ? grounded / terms.length : 0;
    checks.push({
      id: "grounding",
      label: "Grounded in source",
      weight: 20,
      passed: share >= 0.4,
      detail: `${Math.round(share * 100)}% of key terms appear in the source`,
    });
  }

  if (classificationRank(profile.classification) >= classificationRank("confidential")) {
    // Personal identifiers repeated verbatim in the output: contact details, government IDs, card numbers.
    const echoed = scanSensitivity(output).findings.filter((f) => ["email", "phone", "government_id", "payment_card", "secret"].includes(f.kind));
    const n = echoed.reduce((sum, f) => sum + f.count, 0);
    checks.push({
      id: "pii_echo",
      label: "No personal identifiers echoed",
      weight: 10,
      passed: n === 0,
      detail: n ? `Repeated in output: ${echoed.map((f) => f.label.toLowerCase()).join(", ")}` : "No raw identifiers in output",
    });
  }

  const refusal = /\b(?:i can(?:no|')t (?:help|assist)|i'm unable to|as an ai (?:language )?model)\b/i.test(output);
  checks.push({
    id: "no_refusal",
    label: "No refusal or deflection",
    weight: 10,
    passed: !refusal && input.stopReason !== "refusal",
    detail: refusal || input.stopReason === "refusal" ? "Refusal language detected" : "Answers the request",
  });

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
  return { score: Math.round((earned / total) * 100), method: "heuristic", checks };
}
