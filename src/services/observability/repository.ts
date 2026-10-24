import type { DB } from "../db/database";
import type { ExecutionRecord, ExecutionSource, ExecutionSummary, ReviewStatus } from "./types";

/**
 * Execution log and analytics queries. Inputs are stored as a SHA-256
 * fingerprint plus a redacted preview; the raw prompt and documents are not
 * persisted. Outputs are kept for human review.
 */

type Row = Record<string, unknown>;

const SUMMARY_COLUMNS = `id, created_at, source, scenario_id, session_id, status, mode, location, task_type, complexity,
  classification, business_risk, priority_mode, selected_model_id, selected_model_name, executed_model_id, executed_model_name,
  executed_provider, fallback_used, budget_guard, policy_blocks, input_tokens, output_tokens, reasoning_tokens, token_source,
  external_cost_usd, simulated_cost_usd, estimated_cost_usd, baseline_cost_usd, latency_ms, latency_source, output_tps,
  prefill_tps, load_ms, eval_score, review_required, review_status, title, input_preview, input_sha256, error`;

function toSummary(r: Row): ExecutionSummary {
  return {
    id: r.id as string,
    createdAt: r.created_at as string,
    source: r.source as ExecutionSource,
    scenarioId: (r.scenario_id as string) ?? null,
    sessionId: (r.session_id as string) ?? null,
    status: r.status as ExecutionSummary["status"],
    mode: (r.mode as ExecutionSummary["mode"]) ?? null,
    location: (r.location as ExecutionSummary["location"]) ?? null,
    taskType: r.task_type as ExecutionSummary["taskType"],
    complexity: r.complexity as ExecutionSummary["complexity"],
    classification: r.classification as ExecutionSummary["classification"],
    businessRisk: r.business_risk as ExecutionSummary["businessRisk"],
    priorityMode: r.priority_mode as ExecutionSummary["priorityMode"],
    selectedModelId: (r.selected_model_id as string) ?? null,
    selectedModelName: (r.selected_model_name as string) ?? null,
    executedModelId: (r.executed_model_id as string) ?? null,
    executedModelName: (r.executed_model_name as string) ?? null,
    executedProvider: (r.executed_provider as ExecutionSummary["executedProvider"]) ?? null,
    fallbackUsed: Boolean(r.fallback_used),
    budgetGuard: Boolean(r.budget_guard),
    policyBlocks: Number(r.policy_blocks ?? 0),
    inputTokens: (r.input_tokens as number) ?? null,
    outputTokens: (r.output_tokens as number) ?? null,
    reasoningTokens: (r.reasoning_tokens as number) ?? null,
    tokenSource: (r.token_source as ExecutionSummary["tokenSource"]) ?? null,
    externalCostUsd: Number(r.external_cost_usd ?? 0),
    simulatedCostUsd: Number(r.simulated_cost_usd ?? 0),
    estimatedCostUsd: Number(r.estimated_cost_usd ?? 0),
    baselineCostUsd: Number(r.baseline_cost_usd ?? 0),
    latencyMs: (r.latency_ms as number) ?? null,
    latencySource: (r.latency_source as ExecutionSummary["latencySource"]) ?? null,
    outputTps: (r.output_tps as number) ?? null,
    prefillTps: (r.prefill_tps as number) ?? null,
    loadMs: (r.load_ms as number) ?? null,
    evalScore: (r.eval_score as number) ?? null,
    reviewRequired: Boolean(r.review_required),
    reviewStatus: r.review_status as ReviewStatus,
    title: r.title as string,
    inputPreview: r.input_preview as string,
    inputSha256: r.input_sha256 as string,
    error: (r.error as string) ?? null,
  };
}

export interface ListFilter {
  limit?: number;
  offset?: number;
  sinceIso?: string;
  /** Real executions only: no seeded rows and no simulated (DEMO) runs. Blocked real requests are kept. */
  realOnly?: boolean;
  source?: ExecutionSource;
  classification?: string;
  location?: "local" | "cloud" | "blocked";
  mode?: string;
  reviewStatus?: ReviewStatus;
  search?: string;
}

export interface OverviewMetrics {
  total: number;
  local: number;
  cloud: number;
  blocked: number;
  failed: number;
  externalSpendUsd: number;
  simulatedSpendUsd: number;
  baselineSpendUsd: number;
  avgEval: number | null;
  reviewsPending: number;
  reviewsCompleted: number;
  reviewsRequired: number;
  policyBlockedRequests: number;
  policyBlockedModels: number;
  budgetGuardEvents: number;
  fallbackEvents: number;
  realExecutions: number;
  seedExecutions: number;
  localMedianLatencyMs: number | null;
  cloudMedianLatencyMs: number | null;
}

export interface DailyPoint {
  day: string;
  local: number;
  cloud: number;
  blocked: number;
}

export interface ModelDistributionRow {
  modelId: string;
  modelName: string;
  location: "local" | "cloud";
  requests: number;
  avgEval: number | null;
  externalSpendUsd: number;
  simulatedSpendUsd: number;
  medianLatencyMs: number | null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export class ExecutionRepository {
  constructor(private readonly db: DB) {}

  insert(rec: ExecutionRecord): void {
    this.db
      .prepare(
        `INSERT INTO executions (id, created_at, source, scenario_id, session_id, status, mode, location, task_type, complexity,
          classification, business_risk, priority_mode, selected_model_id, selected_model_name, executed_model_id, executed_model_name,
          executed_provider, fallback_used, budget_guard, policy_blocks, input_tokens, output_tokens, reasoning_tokens, token_source,
          external_cost_usd, simulated_cost_usd, estimated_cost_usd, baseline_cost_usd, latency_ms, latency_source, output_tps,
          prefill_tps, load_ms, eval_score, review_required, review_status, title, input_preview, input_sha256, output_text, error,
          decision_json, evaluation_json, review_json, attempts_json, trace_json)
         VALUES (@id, @createdAt, @source, @scenarioId, @sessionId, @status, @mode, @location, @taskType, @complexity,
          @classification, @businessRisk, @priorityMode, @selectedModelId, @selectedModelName, @executedModelId, @executedModelName,
          @executedProvider, @fallbackUsed, @budgetGuard, @policyBlocks, @inputTokens, @outputTokens, @reasoningTokens, @tokenSource,
          @externalCostUsd, @simulatedCostUsd, @estimatedCostUsd, @baselineCostUsd, @latencyMs, @latencySource, @outputTps,
          @prefillTps, @loadMs, @evalScore, @reviewRequired, @reviewStatus, @title, @inputPreview, @inputSha256, @outputText, @error,
          @decision, @evaluation, @review, @attempts, @trace)`,
      )
      .run({
        ...rec,
        selectedModelName: rec.decision.candidates.find((c) => c.modelId === rec.selectedModelId)?.shortName ?? null,
        executedModelName: rec.decision.candidates.find((c) => c.modelId === rec.executedModelId)?.shortName ?? null,
        fallbackUsed: rec.fallbackUsed ? 1 : 0,
        budgetGuard: rec.budgetGuard ? 1 : 0,
        reviewRequired: rec.reviewRequired ? 1 : 0,
        decision: JSON.stringify(rec.decision),
        evaluation: rec.evaluation ? JSON.stringify(rec.evaluation) : null,
        review: rec.review ? JSON.stringify(rec.review) : null,
        attempts: JSON.stringify(rec.attempts),
        trace: JSON.stringify(rec.trace),
      });
  }

  get(id: string): (ExecutionRecord & { selectedModelName: string | null; executedModelName: string | null }) | null {
    const r = this.db.prepare(`SELECT * FROM executions WHERE id = ?`).get(id) as Row | undefined;
    if (!r) return null;
    return {
      ...toSummary(r),
      outputText: (r.output_text as string) ?? null,
      decision: JSON.parse(r.decision_json as string),
      evaluation: r.evaluation_json ? JSON.parse(r.evaluation_json as string) : null,
      review: r.review_json ? JSON.parse(r.review_json as string) : null,
      attempts: JSON.parse((r.attempts_json as string) ?? "[]"),
      trace: JSON.parse(r.trace_json as string),
    };
  }

  private where(f: ListFilter): { sql: string; params: Record<string, unknown> } {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};
    if (f.sinceIso) {
      clauses.push("created_at >= @since");
      params.since = f.sinceIso;
    }
    if (f.realOnly) clauses.push("source != 'seed' AND (mode IS NULL OR mode IN ('local', 'live'))");
    if (f.source) {
      clauses.push("source = @source");
      params.source = f.source;
    }
    if (f.classification) {
      clauses.push("classification = @classification");
      params.classification = f.classification;
    }
    if (f.location === "blocked") clauses.push("status = 'blocked'");
    else if (f.location) {
      clauses.push("location = @location");
      params.location = f.location;
    }
    if (f.mode) {
      clauses.push("mode = @mode");
      params.mode = f.mode;
    }
    if (f.reviewStatus) {
      clauses.push("review_status = @reviewStatus");
      params.reviewStatus = f.reviewStatus;
    }
    if (f.search) {
      clauses.push("(title LIKE @search OR executed_model_name LIKE @search OR id LIKE @search)");
      params.search = `%${f.search}%`;
    }
    return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
  }

  list(f: ListFilter = {}): { rows: ExecutionSummary[]; total: number } {
    const { sql, params } = this.where(f);
    const total = (this.db.prepare(`SELECT COUNT(*) n FROM executions ${sql}`).get(params) as { n: number }).n;
    const rows = this.db
      .prepare(`SELECT ${SUMMARY_COLUMNS} FROM executions ${sql} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: f.limit ?? 50, offset: f.offset ?? 0 }) as Row[];
    return { rows: rows.map(toSummary), total };
  }

  setReviewStatus(id: string, status: ReviewStatus): void {
    this.db.prepare(`UPDATE executions SET review_status = ? WHERE id = ?`).run(status, id);
  }

  appendTrace(id: string, event: ExecutionRecord["trace"][number]): void {
    const r = this.db.prepare(`SELECT trace_json FROM executions WHERE id = ?`).get(id) as { trace_json: string } | undefined;
    if (!r) return;
    const trace = JSON.parse(r.trace_json);
    trace.push(event);
    this.db.prepare(`UPDATE executions SET trace_json = ? WHERE id = ?`).run(JSON.stringify(trace), id);
  }

  overview(f: ListFilter): OverviewMetrics {
    const { sql, params } = this.where(f);
    const rows = this.db
      .prepare(
        `SELECT status, location, source, external_cost_usd, simulated_cost_usd, baseline_cost_usd, eval_score, review_required,
                review_status, policy_blocks, budget_guard, fallback_used, latency_ms, mode FROM executions ${sql}`,
      )
      .all(params) as Row[];
    const evals = rows.map((r) => r.eval_score).filter((v): v is number => typeof v === "number");
    const done = rows.filter((r) => r.status === "completed");
    return {
      total: rows.length,
      local: done.filter((r) => r.location === "local").length,
      cloud: done.filter((r) => r.location === "cloud").length,
      blocked: rows.filter((r) => r.status === "blocked").length,
      failed: rows.filter((r) => r.status === "failed").length,
      externalSpendUsd: rows.reduce((s, r) => s + Number(r.external_cost_usd), 0),
      simulatedSpendUsd: rows.reduce((s, r) => s + Number(r.simulated_cost_usd), 0),
      baselineSpendUsd: done.reduce((s, r) => s + Number(r.baseline_cost_usd), 0),
      avgEval: evals.length ? evals.reduce((a, b) => a + b, 0) / evals.length : null,
      reviewsPending: rows.filter((r) => r.review_status === "pending").length,
      reviewsCompleted: rows.filter((r) => r.review_status === "approved" || r.review_status === "rejected").length,
      reviewsRequired: rows.filter((r) => Number(r.review_required) === 1).length,
      policyBlockedRequests: rows.filter((r) => Number(r.policy_blocks) > 0).length,
      policyBlockedModels: rows.reduce((s, r) => s + Number(r.policy_blocks), 0),
      budgetGuardEvents: rows.filter((r) => Number(r.budget_guard) === 1).length,
      fallbackEvents: rows.filter((r) => Number(r.fallback_used) === 1).length,
      realExecutions: rows.filter((r) => r.source !== "seed" && r.mode !== "demo").length,
      seedExecutions: rows.filter((r) => r.source === "seed").length,
      localMedianLatencyMs: median(done.filter((r) => r.location === "local" && r.latency_ms != null).map((r) => Number(r.latency_ms))),
      cloudMedianLatencyMs: median(done.filter((r) => r.location === "cloud" && r.latency_ms != null).map((r) => Number(r.latency_ms))),
    };
  }

  daily(f: ListFilter, days: number, now: Date): DailyPoint[] {
    const { sql, params } = this.where(f);
    const rows = this.db.prepare(`SELECT created_at, status, location FROM executions ${sql}`).all(params) as Row[];
    const points = new Map<string, DailyPoint>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = localDayKey(d);
      points.set(key, { day: key, local: 0, cloud: 0, blocked: 0 });
    }
    for (const r of rows) {
      const p = points.get(localDayKey(new Date(r.created_at as string)));
      if (!p) continue;
      if (r.status === "blocked") p.blocked++;
      else if (r.location === "local") p.local++;
      else if (r.location === "cloud") p.cloud++;
    }
    return [...points.values()];
  }

  modelDistribution(f: ListFilter): ModelDistributionRow[] {
    const { sql, params } = this.where(f);
    const rows = this.db
      .prepare(
        `SELECT executed_model_id, executed_model_name, location, eval_score, external_cost_usd, simulated_cost_usd, latency_ms
         FROM executions ${sql ? `${sql} AND` : "WHERE"} status = 'completed' AND executed_model_id IS NOT NULL`,
      )
      .all(params) as Row[];
    const groups = new Map<string, Row[]>();
    for (const r of rows) groups.set(r.executed_model_id as string, [...(groups.get(r.executed_model_id as string) ?? []), r]);
    return [...groups.entries()]
      .map(([modelId, rs]) => {
        const evals = rs.map((r) => r.eval_score).filter((v): v is number => typeof v === "number");
        return {
          modelId,
          modelName: (rs[0].executed_model_name as string) ?? modelId,
          location: rs[0].location as "local" | "cloud",
          requests: rs.length,
          avgEval: evals.length ? evals.reduce((a, b) => a + b, 0) / evals.length : null,
          externalSpendUsd: rs.reduce((s, r) => s + Number(r.external_cost_usd), 0),
          simulatedSpendUsd: rs.reduce((s, r) => s + Number(r.simulated_cost_usd), 0),
          medianLatencyMs: median(rs.map((r) => r.latency_ms).filter((v): v is number => typeof v === "number")),
        };
      })
      .sort((a, b) => b.requests - a.requests);
  }

  /** Real (non-simulated) throughput samples, used to replace configured latency with measurements. */
  measuredThroughput(modelId: string, limit = 20): { outputTps: number[]; prefillTps: number[]; latencyMs: number[]; outputTokens: number[] } {
    const rows = this.db
      .prepare(
        `SELECT output_tps, prefill_tps, latency_ms, output_tokens FROM executions
         WHERE executed_model_id = ? AND mode IN ('local', 'live') AND status = 'completed'
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(modelId, limit) as Row[];
    return {
      outputTps: rows.map((r) => r.output_tps).filter((v): v is number => typeof v === "number" && v > 0),
      prefillTps: rows.map((r) => r.prefill_tps).filter((v): v is number => typeof v === "number" && v > 0),
      latencyMs: rows.map((r) => r.latency_ms).filter((v): v is number => typeof v === "number"),
      outputTokens: rows.map((r) => r.output_tokens).filter((v): v is number => typeof v === "number"),
    };
  }

  /** Real on-device executions only (seeded and simulated rows excluded). */
  realLocalStats(now: Date): { total: number; today: number; medianLatencyMs: number | null; medianOutputTps: number | null; lastAt: string | null } {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const rows = this.db
      .prepare(`SELECT created_at, latency_ms, output_tps FROM executions WHERE mode = 'local' AND status = 'completed' ORDER BY created_at DESC LIMIT 200`)
      .all() as Row[];
    return {
      total: rows.length,
      today: rows.filter((r) => (r.created_at as string) >= start.toISOString()).length,
      medianLatencyMs: median(rows.map((r) => r.latency_ms).filter((v): v is number => typeof v === "number")),
      medianOutputTps: median(rows.map((r) => r.output_tps).filter((v): v is number => typeof v === "number")),
      lastAt: (rows[0]?.created_at as string) ?? null,
    };
  }

  countToday(modelPrefix: string, now: Date): number {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return (
      this.db
        .prepare(`SELECT COUNT(*) n FROM executions WHERE executed_model_id LIKE ? AND created_at >= ? AND status = 'completed'`)
        .get(`${modelPrefix}%`, start.toISOString()) as { n: number }
    ).n;
  }

  deleteSeed(): number {
    return this.db.prepare(`DELETE FROM executions WHERE source = 'seed'`).run().changes;
  }

  hasAny(): boolean {
    return Boolean(this.db.prepare(`SELECT 1 FROM executions LIMIT 1`).get());
  }
}

export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export { median };
