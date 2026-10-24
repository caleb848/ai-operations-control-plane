/**
 * Spend controls. The guard reserves the worst-case cost of a request
 * (input + max_tokens at list price) before execution, so a request can never
 * push a session past its limit even if the model uses every allowed token.
 * Actual usage is reconciled into the ledger afterwards.
 */

export interface BudgetSnapshot {
  sessionBudgetUsd: number;
  /** Real API spend this session. */
  sessionActualUsd: number;
  /** Estimated spend of simulated (demo) cloud executions this session. */
  sessionSimulatedUsd: number;
  lifetimeBudgetUsd: number;
  lifetimeActualUsd: number;
  /** Worst-case amounts reserved for in-flight paid calls, plus unreconciled ones (e.g. timeouts). */
  sessionReservedUsd?: number;
  lifetimeReservedUsd?: number;
  /** True when spend comes from a scenario override rather than the ledger. */
  simulated?: boolean;
}

export interface BudgetCheck {
  allowed: boolean;
  remainingUsd: number;
  requiredUsd: number;
  limit: "session" | "lifetime" | null;
  message: string;
}

export function sessionSpend(b: BudgetSnapshot): number {
  return b.sessionActualUsd + b.sessionSimulatedUsd + (b.sessionReservedUsd ?? 0);
}

export function remainingBudget(b: BudgetSnapshot): { remainingUsd: number; limit: "session" | "lifetime" } {
  const session = b.sessionBudgetUsd - sessionSpend(b);
  const lifetime = b.lifetimeBudgetUsd - b.lifetimeActualUsd - (b.lifetimeReservedUsd ?? 0);
  return session <= lifetime
    ? { remainingUsd: Math.max(0, session), limit: "session" }
    : { remainingUsd: Math.max(0, lifetime), limit: "lifetime" };
}

export function checkBudget(b: BudgetSnapshot, worstCaseUsd: number): BudgetCheck {
  const { remainingUsd, limit } = remainingBudget(b);
  if (worstCaseUsd <= 0) {
    return { allowed: true, remainingUsd, requiredUsd: 0, limit: null, message: "No external API cost" };
  }
  if (worstCaseUsd > remainingUsd) {
    return {
      allowed: false,
      remainingUsd,
      requiredUsd: worstCaseUsd,
      limit,
      message: `Worst-case cost $${worstCaseUsd.toFixed(4)} exceeds the remaining ${limit} budget of $${remainingUsd.toFixed(4)}`,
    };
  }
  return {
    allowed: true,
    remainingUsd,
    requiredUsd: worstCaseUsd,
    limit,
    message: `Reserved $${worstCaseUsd.toFixed(4)} of $${remainingUsd.toFixed(4)} remaining`,
  };
}

export function budgetUtilization(b: BudgetSnapshot): number {
  return b.sessionBudgetUsd > 0 ? Math.min(1, sessionSpend(b) / b.sessionBudgetUsd) : 1;
}
