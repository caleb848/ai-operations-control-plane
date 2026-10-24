import { MODE_WEIGHTS, PRIORITY_LABEL } from "../routing/config";
import { costFactor, latencyFactor } from "../routing/engine";
import type { CandidateEvaluation, DataClassification, PriorityMode } from "../types";
import { CLOUD_PRIVACY_SCORE } from "../routing/config";
import { formatUsd } from "../pricing/cost";

/**
 * Comparison Lab recommendation. Ranks only models that actually ran (local
 * inference or a live API call) on what was observed: measured latency,
 * actual cost and the evaluation estimate of the real output. Models that
 * were not called (DEMO estimates) are never recommended; their estimated
 * cost and latency are mentioned for reference only.
 */

export interface ComparisonRun {
  candidate: CandidateEvaluation;
  status: "completed" | "estimated" | "blocked" | "failed" | "skipped";
  mode: "demo" | "local" | "live" | null;
  evalScore: number | null;
  latencyMs: number | null;
  latencySource: "measured" | "recorded" | "estimated" | null;
  /** Simulated run that replayed a real recorded output: its evaluation and latency are real evidence. */
  recorded?: boolean;
  costUsd: number;
}

export interface Recommendation {
  modelId: string | null;
  ranked: { modelId: string; score: number; quality: number; qualitySource: "measured" | "profile" }[];
  reasons: string[];
}

export function recommend(runs: ComparisonRun[], priorityMode: PriorityMode, classification: DataClassification, minEval = 70): Recommendation {
  const w = MODE_WEIGHTS[priorityMode];
  const real = (r: ComparisonRun) => r.mode !== "demo" || r.recorded === true;
  const done = runs.filter((r) => r.status === "completed" && real(r));
  const estimates = runs.filter((r) => r.status === "estimated" || (r.status === "completed" && !real(r)));
  if (!done.length) return { modelId: null, ranked: [], reasons: ["No model has run yet. Run the comparison to get a recommendation based on real results."] };

  const scored = done.map((r) => {
    const measured = r.evalScore != null;
    const quality = measured ? 0.5 * r.evalScore! + 0.5 * r.candidate.quality.score : r.candidate.quality.score;
    const latency = r.latencyMs ?? r.candidate.latency.totalMs;
    const privacy = r.candidate.location === "local" ? 100 : CLOUD_PRIVACY_SCORE[classification];
    const score = w.quality * quality + w.cost * costFactor(r.costUsd) + w.latency * latencyFactor(latency) + w.privacy * privacy;
    return { run: r, modelId: r.candidate.modelId, score: Math.round(score * 10) / 10, quality: Math.round(quality), qualitySource: (measured ? "measured" : "profile") as "measured" | "profile" };
  });

  // An output that fails the evaluation bar is not recommended, however cheap.
  const passing = scored.filter((s) => (s.run.evalScore ?? 0) >= minEval);
  const pool = (passing.length ? passing : scored).sort((a, b) => b.score - a.score);
  const best = pool[0];
  const reasons: string[] = [];
  const c = best.run.candidate;

  reasons.push(`Highest ${PRIORITY_LABEL[priorityMode]} score among ${done.length} measured run${done.length > 1 ? "s" : ""} (${Math.round(best.score)}).`);
  if (c.location === "local") reasons.push(`Runs on this device: no external data transfer and ${formatUsd(0)} external API cost.`);
  else reasons.push(`Actual external API cost ${formatUsd(best.run.costUsd)}.`);
  if (best.qualitySource === "measured") reasons.push(`Evaluation estimate ${best.run.evalScore}/100 on its ${best.run.recorded ? "recorded" : "real"} output.`);

  const runnerUp = pool[1];
  if (runnerUp) {
    const r = runnerUp.run;
    const dl = (r.latencyMs ?? 0) - (best.run.latencyMs ?? 0);
    const parts = [`${r.candidate.shortName} scored ${Math.round(runnerUp.score)}`];
    if (r.costUsd > best.run.costUsd) parts.push(`costs ${formatUsd(r.costUsd)} more`);
    if (Math.abs(dl) > 1000) parts.push(dl > 0 ? `${(dl / 1000).toFixed(1)} s slower` : `${(-dl / 1000).toFixed(1)} s faster`);
    if (runnerUp.quality !== best.quality) parts.push(`quality ${runnerUp.quality} vs ${best.quality} for ${c.shortName}`);
    reasons.push(`${parts.join(", ")}.`);
  }
  const excluded = scored.filter((s) => !pool.includes(s));
  if (excluded.length) reasons.push(`Excluded below the ${minEval} evaluation bar: ${excluded.map((e) => e.run.candidate.shortName).join(", ")}.`);
  if (estimates.length) {
    const est = estimates
      .map((r) => `${r.candidate.shortName} est. ${formatUsd(r.candidate.cost.costUsd)}, ~${Math.max(1, Math.round(r.candidate.latency.totalMs / 1000))} s`)
      .join("; ");
    reasons.push(`Not called (DEMO), shown for reference only: ${est}. Enable live mode to compare real cloud outputs.`);
  }

  return { modelId: best.modelId, ranked: pool.map(({ modelId, score, quality, qualitySource }) => ({ modelId, score, quality, qualitySource })), reasons };
}
