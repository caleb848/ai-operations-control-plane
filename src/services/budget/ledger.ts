import type { AppConfig } from "@/config/env";
import type { BudgetSnapshot } from "@/core/budget/budget";
import type { DB } from "../db/database";

export interface LedgerEntry {
  id: number;
  at: string;
  sessionId: string;
  executionId: string | null;
  modelId: string | null;
  kind: "actual" | "simulated" | "reserved" | "unreconciled";
  amountUsd: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface BudgetSession {
  id: string;
  startedAt: string;
  budgetUsd: number;
}

export interface LedgerLimits {
  sessionBudgetUsd: number;
  lifetimeBudgetUsd: number;
  /** DEMO counts simulated spend toward the guard so budget behavior is visible; LIVE counts only real spend. */
  countSimulated: boolean;
}

export function ledgerLimitsFor(config: AppConfig): LedgerLimits {
  return {
    sessionBudgetUsd: config.sessionBudgetUsd,
    lifetimeBudgetUsd: config.lifetimeBudgetUsd,
    // In the public demo every visitor shares one in-memory ledger, so simulated spend is shown but never moves the guard.
    countSimulated: !config.cloudLive && !config.deployment.publicDeployment,
  };
}

/**
 * Spend ledger. "actual" rows are real API charges computed from provider
 * usage at list price; "simulated" rows are the estimated cost of DEMO
 * executions, kept separate so simulated spend can never be mistaken for real.
 */
export class BudgetLedger {
  constructor(
    private readonly db: DB,
    private readonly limits: LedgerLimits,
    private readonly now: () => Date = () => new Date(),
  ) {}

  currentSession(): BudgetSession {
    const row = this.db
      .prepare(`SELECT id, started_at, budget_usd FROM budget_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1`)
      .get() as { id: string; started_at: string; budget_usd: number } | undefined;
    if (row) return { id: row.id, startedAt: row.started_at, budgetUsd: row.budget_usd };
    return this.startSession();
  }

  startSession(): BudgetSession {
    const at = this.now().toISOString();
    this.db.prepare(`UPDATE budget_sessions SET ended_at = ? WHERE ended_at IS NULL`).run(at);
    const id = `ses_${at.replace(/\D/g, "").slice(0, 14)}${Math.random().toString(36).slice(2, 6)}`;
    this.db.prepare(`INSERT OR REPLACE INTO budget_sessions (id, started_at, budget_usd) VALUES (?, ?, ?)`).run(id, at, this.limits.sessionBudgetUsd);
    return { id, startedAt: at, budgetUsd: this.limits.sessionBudgetUsd };
  }

  charge(entry: Omit<LedgerEntry, "id" | "at" | "sessionId"> & { at?: string; sessionId?: string }): void {
    if (entry.amountUsd <= 0) return;
    const session = entry.sessionId ?? this.currentSession().id;
    this.db
      .prepare(
        `INSERT INTO ledger (at, session_id, execution_id, model_id, kind, amount_usd, input_tokens, output_tokens)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(entry.at ?? this.now().toISOString(), session, entry.executionId, entry.modelId, entry.kind, entry.amountUsd, entry.inputTokens, entry.outputTokens);
  }

  /**
   * Reserves a paid call's worst-case cost. Synchronous (better-sqlite3), so a
   * check-then-reserve sequence with no await in between can't be interleaved
   * by a concurrent request.
   */
  reserve(entry: { executionId: string; modelId: string; amountUsd: number }): number {
    const r = this.db
      .prepare(`INSERT INTO ledger (at, session_id, execution_id, model_id, kind, amount_usd) VALUES (?, ?, ?, ?, 'reserved', ?)`)
      .run(this.now().toISOString(), this.currentSession().id, entry.executionId, entry.modelId, entry.amountUsd);
    return Number(r.lastInsertRowid);
  }

  /** Replaces a reservation with the actual, provider-reported cost. */
  settle(id: number, amountUsd: number, tokens: { inputTokens: number; outputTokens: number }): void {
    this.db
      .prepare(`UPDATE ledger SET kind = 'actual', amount_usd = ?, input_tokens = ?, output_tokens = ? WHERE id = ? AND kind = 'reserved'`)
      .run(amountUsd, tokens.inputTokens, tokens.outputTokens, id);
  }

  /** The provider did not bill (connection refused, 4xx/5xx before generation, cache hit). */
  release(id: number): void {
    this.db.prepare(`DELETE FROM ledger WHERE id = ? AND kind = 'reserved'`).run(id);
  }

  /** Outcome unknown (timeout): keep the worst case counted rather than risk under-reporting. */
  keepUnreconciled(id: number): void {
    this.db.prepare(`UPDATE ledger SET kind = 'unreconciled' WHERE id = ? AND kind = 'reserved'`).run(id);
  }

  snapshot(): BudgetSnapshot & { sessionId: string; sessionStartedAt: string; sessionSimulatedTotalUsd: number } {
    const s = this.currentSession();
    const sum = (sql: string, ...p: unknown[]) => (this.db.prepare(sql).get(...p) as { v: number | null }).v ?? 0;
    const simulated = sum(`SELECT SUM(amount_usd) v FROM ledger WHERE session_id = ? AND kind = 'simulated'`, s.id);
    return {
      sessionId: s.id,
      sessionStartedAt: s.startedAt,
      sessionBudgetUsd: s.budgetUsd,
      sessionActualUsd: sum(`SELECT SUM(amount_usd) v FROM ledger WHERE session_id = ? AND kind = 'actual'`, s.id),
      sessionSimulatedUsd: this.limits.countSimulated ? simulated : 0,
      sessionSimulatedTotalUsd: simulated,
      lifetimeBudgetUsd: this.limits.lifetimeBudgetUsd,
      lifetimeActualUsd: sum(`SELECT SUM(amount_usd) v FROM ledger WHERE kind = 'actual'`),
      sessionReservedUsd: sum(`SELECT SUM(amount_usd) v FROM ledger WHERE session_id = ? AND kind IN ('reserved', 'unreconciled')`, s.id),
      lifetimeReservedUsd: sum(`SELECT SUM(amount_usd) v FROM ledger WHERE kind IN ('reserved', 'unreconciled')`),
    };
  }

  entries(limit = 50): LedgerEntry[] {
    const rows = this.db.prepare(`SELECT * FROM ledger ORDER BY id DESC LIMIT ?`).all(limit) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as number,
      at: r.at as string,
      sessionId: r.session_id as string,
      executionId: (r.execution_id as string) ?? null,
      modelId: (r.model_id as string) ?? null,
      kind: r.kind as LedgerEntry["kind"],
      amountUsd: r.amount_usd as number,
      inputTokens: (r.input_tokens as number) ?? null,
      outputTokens: (r.output_tokens as number) ?? null,
    }));
  }
}
