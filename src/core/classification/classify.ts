import { CLASSIFICATION_LABEL, classificationRank, maxClassification } from "../security/classification";
import { scanSensitivity } from "../security/sensitivity";
import type { BusinessRisk, Complexity, TaskInput, TaskProfile, TaskType } from "../types";
import { estimateTokens } from "../pricing/tokens";

/**
 * Rule-based task classifier. Deterministic and explainable by design: every
 * conclusion carries the signals that produced it, and nothing here calls a
 * model, so classification is free and identical across runs.
 */

interface TypeRule {
  type: TaskType;
  patterns: RegExp[];
  weight: number;
}

const TYPE_RULES: TypeRule[] = [
  {
    type: "strategic_reasoning",
    weight: 3,
    patterns: [
      /\bpositioning\b/i,
      /\bstrateg(?:y|ic)\b/i,
      /\brecommend(?:ation)?s?\b/i,
      /\btrade-?offs?\b/i,
      /\bsynthesi[sz]e\b/i,
      /\bprioriti[sz]e\b/i,
      /\bimplications?\b/i,
    ],
  },
  { type: "coding", weight: 3, patterns: [/\bfunction\b/i, /\b(?:sql|regex|typescript|python)\b/i, /\bbug\b/i, /\brefactor\b/i, /```/] },
  {
    type: "extraction",
    weight: 3,
    patterns: [/\bextract\b/i, /\bpull out\b/i, /\bas json\b/i, /\bfields?\b/i, /\blist (?:all|every)\b/i, /\bstructured\b/i],
  },
  { type: "classification", weight: 3, patterns: [/\bclassify\b/i, /\bcategori[sz]e\b/i, /\blabel (?:each|the)\b/i, /\bsentiment\b/i, /\btriage\b/i] },
  {
    type: "summarization",
    weight: 2,
    patterns: [/\bsummari[sz]e\b/i, /\bsummary\b/i, /\btl;?dr\b/i, /\bkey points\b/i, /\bcondense\b/i, /\bstatus update\b/i],
  },
  {
    type: "document_analysis",
    weight: 2,
    patterns: [/\breview (?:the|this) (?:document|brief|contract|report)\b/i, /\banaly[sz]e (?:the|this)\b/i, /\brisks?\b/i, /\bbrief\b/i],
  },
  {
    type: "drafting",
    weight: 2,
    patterns: [/\bdraft\b/i, /\bwrite\b/i, /\bcompose\b/i, /\b(?:email|post|announcement|faq)\b/i, /\brewrite\b/i],
  },
];

const TASK_TYPE_LABEL: Record<TaskType, string> = {
  summarization: "Summarization",
  extraction: "Extraction",
  classification: "Classification",
  document_analysis: "Document Analysis",
  drafting: "Drafting",
  strategic_reasoning: "Strategic Reasoning",
  coding: "Coding",
  general: "General",
};

export function taskTypeLabel(t: TaskType): string {
  return TASK_TYPE_LABEL[t];
}

export const COMPLEXITY_LABEL: Record<Complexity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  very_high: "Very High",
};

function detectTaskType(instruction: string, hasContext: boolean): { type: TaskType; signals: string[] } {
  const scores = new Map<TaskType, { score: number; hits: string[] }>();
  for (const rule of TYPE_RULES) {
    for (const re of rule.patterns) {
      const m = instruction.match(re);
      if (m) {
        const entry = scores.get(rule.type) ?? { score: 0, hits: [] };
        entry.score += rule.weight;
        entry.hits.push(m[0].toLowerCase());
        scores.set(rule.type, entry);
      }
    }
  }
  if (scores.size === 0) {
    return hasContext
      ? { type: "document_analysis", signals: ["instruction references supplied documents"] }
      : { type: "general", signals: ["no task-type keywords"] };
  }
  const [type, best] = [...scores.entries()].sort((a, b) => b[1].score - a[1].score)[0];
  return { type, signals: best.hits.slice(0, 4).map((h) => `"${h}"`) };
}

/** Base complexity contribution per task type (0–100 scale). */
const TYPE_BASE: Record<TaskType, number> = {
  classification: 10,
  extraction: 18,
  summarization: 20,
  general: 28,
  drafting: 32,
  document_analysis: 38,
  coding: 45,
  strategic_reasoning: 60,
};

const REASONING_CUES: RegExp[] = [
  /\bsynthesi[sz]e\b/i,
  /\btrade-?offs?\b/i,
  /\bcompeti(?:tor|tive)\b/i,
  /\bmultiple\b|\bseveral\b/i,
  /\bprioriti[sz]e\b/i,
  /\bjustify\b|\brationale\b/i,
  /\bscenarios?\b/i,
  /\brisks?\b/i,
];

function scoreComplexity(input: TaskInput, type: TaskType, inputTokens: number, docCount: number) {
  const signals: string[] = [`${TASK_TYPE_LABEL[type].toLowerCase()} base`];
  let score = TYPE_BASE[type];

  const cues = REASONING_CUES.filter((re) => re.test(input.instruction));
  if (cues.length) {
    score += Math.min(cues.length * 7, 28);
    signals.push(`${cues.length} reasoning cue${cues.length > 1 ? "s" : ""}`);
  }
  if (inputTokens > 6000) {
    score += 14;
    signals.push(`large context (~${Math.round(inputTokens / 1000)}K tokens)`);
  } else if (inputTokens > 2000) {
    score += 7;
    signals.push(`moderate context (~${(inputTokens / 1000).toFixed(1)}K tokens)`);
  }
  if (docCount > 1) {
    score += Math.min((docCount - 1) * 5, 15);
    signals.push(`${docCount} source documents`);
  }
  const constraints = input.instruction.match(/\b(?:must|exactly|no more than|at most|without|only)\b/gi)?.length ?? 0;
  if (constraints >= 2) {
    score += 5;
    signals.push(`${constraints} explicit constraints`);
  }
  score = Math.max(0, Math.min(100, score));
  const level: Complexity = score >= 75 ? "very_high" : score >= 55 ? "high" : score >= 30 ? "medium" : "low";
  return { score, level, signals };
}

const RISK_HIGH = [
  /\bcustomer[- ]facing\b/i,
  /\bcustomers?\b/i,
  /\bhelp cent(?:er|re)\b/i,
  /\bpress\b/i,
  /\bpublic(?:ly)? (?:post|statement|release)\b/i,
  /\blegal\b/i,
  /\bcontract\b/i,
  /\binvestors?\b/i,
  /\bregulat/i,
];
const RISK_MEDIUM = [/\bexecutive\b|\bexec\b|\bleadership\b|\bboard\b/i, /\bclient\b/i, /\bdecision\b/i, /\bbudget\b/i, /\bpricing\b/i];

function scoreRisk(text: string): { risk: BusinessRisk; signals: string[] } {
  const high = RISK_HIGH.map((re) => text.match(re)?.[0]).filter(Boolean) as string[];
  if (high.length) return { risk: "high", signals: high.slice(0, 3).map((h) => `external/regulated audience ("${h.toLowerCase()}")`) };
  const med = RISK_MEDIUM.map((re) => text.match(re)?.[0]).filter(Boolean) as string[];
  if (med.length) return { risk: "medium", signals: med.slice(0, 3).map((h) => `decision support ("${h.toLowerCase()}")`) };
  return { risk: "low", signals: ["internal working output"] };
}

/** Visible output tokens a well-formed answer usually needs, before complexity scaling. */
const EXPECTED_OUTPUT: Record<TaskType, number> = {
  classification: 40,
  extraction: 180,
  summarization: 220,
  document_analysis: 320,
  general: 260,
  drafting: 380,
  coding: 400,
  strategic_reasoning: 700,
};
const OUTPUT_SCALE: Record<Complexity, number> = { low: 0.7, medium: 1, high: 1.3, very_high: 1.6 };

export function countDocuments(context: string | undefined): number {
  if (!context?.trim()) return 0;
  const markers = context.match(/^(?:#{1,3} |---\s*$|DOCUMENT \d|\[Doc(?:ument)? \d)/gim)?.length ?? 0;
  return Math.max(1, markers);
}

export function classifyTask(input: TaskInput): TaskProfile {
  const context = input.context ?? "";
  const fullText = `${input.instruction}\n\n${context}`;
  const estimatedInputTokens = estimateTokens(fullText) + 60; // + system prompt overhead
  const documentCount = countDocuments(context);

  const detectedType = detectTaskType(input.instruction, documentCount > 0);
  const taskType = input.taskTypeOverride ?? detectedType.type;

  const cx = scoreComplexity(input, taskType, estimatedInputTokens, documentCount);
  const complexity = input.complexityOverride ?? cx.level;

  const scan = scanSensitivity(fullText);
  // Credentials always make a request Restricted (enforced in code, not policy data).
  const detected = scan.hasSecrets ? "restricted" : scan.detected;

  const declared = input.declaredClassification;
  // A declared label may raise the classification, never lower it below what was detected.
  const classification = declared ? maxClassification(declared, detected) : maxClassification(detected, "internal");

  let classificationReason: string;
  if (declared && classificationRank(detected) > classificationRank(declared)) {
    classificationReason = `Declared ${CLASSIFICATION_LABEL[declared]}, raised to ${CLASSIFICATION_LABEL[detected]} by the sensitivity scan`;
  } else if (declared) {
    classificationReason = `Declared ${CLASSIFICATION_LABEL[declared]}${scan.findings.length ? "; scan findings are within that level" : "; no sensitive content detected"}`;
  } else if (scan.findings.length) {
    classificationReason = `Detected ${CLASSIFICATION_LABEL[classification]} from ${scan.findings.length} finding${scan.findings.length > 1 ? "s" : ""}`;
  } else {
    classificationReason = "Unlabeled content defaults to Internal";
  }

  // Risk follows the output's audience, which the instruction names; source documents don't change who reads the result.
  const risk = scoreRisk(input.instruction);
  const expectedOutputTokens = Math.round(EXPECTED_OUTPUT[taskType] * OUTPUT_SCALE[complexity]);

  return {
    taskType,
    taskTypeSource: input.taskTypeOverride ? "override" : "detected",
    taskTypeSignals: input.taskTypeOverride ? ["set by operator"] : detectedType.signals,
    complexity,
    complexitySource: input.complexityOverride ? "override" : "detected",
    complexityScore: cx.score,
    complexitySignals: input.complexityOverride ? ["set by operator", ...cx.signals] : cx.signals,
    detectedClassification: detected,
    declaredClassification: declared,
    classification,
    classificationReason,
    findings: scan.findings,
    businessRisk: risk.risk,
    riskSignals: risk.signals,
    estimatedInputTokens,
    expectedOutputTokens,
    documentCount,
  };
}
