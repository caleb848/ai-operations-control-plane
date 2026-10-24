import "server-only";
import { connection } from "next/server";
import { publicConfig } from "@/config/env";
import { remainingBudget } from "@/core/budget/budget";
import { BASELINE_MODEL_ID } from "@/core/models/cloud-catalog";
import type { ListFilter } from "@/services/observability/repository";
import { ready } from "./container";

export type DataScope = "all" | "real";

function scopeFilter(scope: DataScope, days: number): ListFilter {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));
  return { sinceIso: since.toISOString(), realOnly: scope === "real" };
}

export async function overviewData(scope: DataScope, days = 7) {
  await connection();
  const c = await ready();
  const filter = scopeFilter(scope, days);
  const metrics = c.executions.overview(filter);
  const daily = c.executions.daily(filter, days, new Date());
  const distribution = c.executions.modelDistribution(filter);
  const recent = c.executions.list({ ...filter, limit: 8 }).rows;
  // Governance feed: newest first, but at most two of each event type so rare events stay visible.
  const kind = (r: (typeof recent)[number]) =>
    r.status === "blocked" ? "blocked" : r.status === "failed" ? "failed" : r.budgetGuard ? "budget" : r.fallbackUsed ? "fallback" : r.policyBlocks > 0 ? "policy" : null;
  const perKind = new Map<string, number>();
  const events = c.executions
    .list({ ...filter, limit: 300 })
    .rows.filter((r) => {
      const k = kind(r);
      if (!k) return false;
      const n = perKind.get(k) ?? 0;
      perKind.set(k, n + 1);
      return n < 2;
    })
    .slice(0, 7);
  const allTime = c.executions.overview({});
  const baselineName = (await c.registry.snapshot()).models.find((m) => m.id === BASELINE_MODEL_ID)?.displayName ?? "the baseline model";
  return { metrics, daily, distribution, recent, events, allTime, baselineName, scope, days };
}

export async function requestsData(params: { q?: string; location?: string; classification?: string; mode?: string; data?: string; page?: number }) {
  await connection();
  const c = await ready();
  const limit = 25;
  const page = Math.max(1, params.page ?? 1);
  const location = params.location === "local" || params.location === "cloud" || params.location === "blocked" ? params.location : undefined;
  const result = c.executions.list({
    limit,
    offset: (page - 1) * limit,
    search: params.q || undefined,
    location,
    classification: params.classification || undefined,
    mode: params.mode || undefined,
    realOnly: params.data === "real",
  });
  return { ...result, page, limit };
}

export async function requestDetail(id: string) {
  await connection();
  const c = await ready();
  const record = c.executions.get(id);
  return record ? { record, approval: c.approvals.forExecution(id) } : null;
}

export async function approvalsData() {
  await connection();
  const c = await ready();
  const approvals = c.approvals.list();
  const items = approvals
    .map((a) => {
      const e = c.executions.get(a.executionId);
      return e ? { approval: a, execution: e } : null;
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  return { pending: items.filter((i) => i.approval.status === "pending"), decided: items.filter((i) => i.approval.status !== "pending").slice(0, 30) };
}

export async function modelsData() {
  await connection();
  const c = await ready();
  const snap = await c.registry.snapshot();
  // Only the key-free view leaves this module.
  return { snap, overrides: c.settings.modelOverrides(), config: publicConfig(c.config) };
}

export async function policyData() {
  await connection();
  const c = await ready();
  return { policy: c.settings.policy() };
}

export async function budgetData() {
  await connection();
  const c = await ready();
  const b = c.ledger.snapshot();
  return { budget: { ...b, ...remainingBudget(b) }, ledger: c.ledger.entries(50), cache: c.cache.stats(), config: publicConfig(c.config) };
}
