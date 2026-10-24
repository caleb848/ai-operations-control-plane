import "server-only";
import { publicConfig } from "@/config/env";
import { remainingBudget } from "@/core/budget/budget";
import { BASELINE_MODEL_ID } from "@/core/models/cloud-catalog";
import type { ExecuteRequest } from "@/services/execution/executor";
import type { Container } from "./container";
import type { TaskRequestBody } from "./schemas";

/** Key-free status for the sidebar, top bar and Local AI panel. */
export async function statusView(c: Container) {
  const snap = await c.registry.snapshot();
  const budget = c.ledger.snapshot();
  const resident = new Set(snap.ollama.running.map((r) => r.name));
  const local = snap.models.filter((m) => m.local);
  const primary = local.find((m) => resident.has(m.providerModelId)) ?? local[0] ?? null;
  const stats = c.executions.realLocalStats(new Date());
  return {
    checkedAt: snap.checkedAt,
    ollama: snap.ollama,
    localModels: local.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      providerModelId: m.providerModelId,
      resident: resident.has(m.providerModelId),
      enabled: m.enabled,
      parameterSize: m.details?.parameterSize ?? null,
      quantization: m.details?.quantization ?? null,
      contextWindowTokens: m.contextWindowTokens,
      latencySource: m.latency.source,
      outputTokensPerSec: m.latency.outputTokensPerSec,
      samples: m.latency.samples,
    })),
    primaryLocalId: primary?.id ?? null,
    local: stats,
    config: publicConfig(c.config),
    budget: { ...budget, ...remainingBudget(budget) },
    pendingApprovals: c.approvals.pendingCount(),
    baselineModelId: BASELINE_MODEL_ID,
  };
}

export type StatusView = Awaited<ReturnType<typeof statusView>>;

export function toExecuteRequest(body: TaskRequestBody): ExecuteRequest {
  return {
    task: {
      instruction: body.instruction,
      context: body.context,
      declaredClassification: body.declaredClassification,
      taskTypeOverride: body.taskTypeOverride,
      complexityOverride: body.complexityOverride,
    },
    priorityMode: body.priorityMode,
    permission: body.permission,
    simulation: body.simulation,
    scenarioId: body.scenarioId,
    pinModelId: body.pinModelId,
    allowLive: body.allowLive,
    maxLiveCostUsd: body.maxLiveCostUsd,
    source: body.source ?? (body.scenarioId ? "scenario" : "console"),
  };
}
