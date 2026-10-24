import { Ban, Check, ShieldAlert, Wallet } from "lucide-react";
import { COMPLEXITY_LABEL, taskTypeLabel } from "@/core/classification/classify";
import { PRIORITY_LABEL } from "@/core/routing/config";
import type { RoutingDecision } from "@/core/types";
import { ClassificationBadge, LocationChip } from "@/components/ui/badges";
import { SectionLabel } from "@/components/ui/primitives";
import { cn, formatMs, formatTokens, formatUsd } from "@/lib/format";
import { CandidateList, Rationale } from "./candidates";
import { RouteMap } from "./route-map";

export function ProfileChips({ decision }: { decision: RoutingDecision }) {
  const p = decision.profile;
  const chip = "inline-flex h-5 items-center rounded-[5px] border border-line bg-surface-2 px-1.5 text-xs text-fg-2";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={chip}>{taskTypeLabel(p.taskType)}</span>
      <span className={chip}>{COMPLEXITY_LABEL[p.complexity]} complexity</span>
      <ClassificationBadge value={p.classification} upper />
      <span className={chip}>~{formatTokens(p.estimatedInputTokens)} tokens in</span>
      <span className={chip}>Risk: {p.businessRisk}</span>
      <span className={chip}>Priority: {PRIORITY_LABEL[decision.priorityMode]}</span>
    </div>
  );
}

function Verdict({ decision }: { decision: RoutingDecision }) {
  const sel = decision.candidates.find((c) => c.modelId === decision.selectedModelId);
  if (!sel) {
    const failClosed = decision.block?.code === "local_required_unavailable";
    return (
      <div className="flex items-start gap-3 rounded-lg border border-blocked-line bg-blocked-soft px-4 py-3.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-blocked text-white">
          {failClosed ? <ShieldAlert className="size-4" /> : decision.block?.code === "budget_exhausted" ? <Wallet className="size-4" /> : <Ban className="size-4" />}
        </span>
        <div>
          <div className="text-[15px] font-semibold text-fg">Blocked{failClosed ? " · fail-closed" : ""}</div>
          <div className="mt-0.5 text-sm text-fg-2">{decision.block?.message}</div>
          {failClosed ? <div className="mt-1 text-xs text-blocked-fg">Nothing was sent to a cloud provider as a fallback.</div> : null}
        </div>
      </div>
    );
  }
  const local = sel.location === "local";
  return (
    <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border px-4 py-3", local ? "border-local-line bg-local-soft" : "border-cloud-line bg-cloud-soft")}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md text-white", local ? "bg-local" : "bg-cloud")}>
          <Check className="size-4" strokeWidth={3} />
        </span>
        <div className="min-w-0">
          <div className="text-2xs font-medium uppercase tracking-[0.08em] text-fg-3">{decision.budgetGuard ? "Rerouted by Budget Guard" : "Selected"}</div>
          <div className="flex items-center gap-2">
            <span className="truncate text-[16px] font-semibold tracking-[-0.01em] text-fg">{sel.displayName}</span>
            <LocationChip location={sel.location} />
          </div>
        </div>
      </div>
      <dl className="ml-auto grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-fg-3">Routing score</dt>
          <dd className="tnum text-sm font-medium text-fg">{Math.round(sel.routingScore ?? 0)}</dd>
        </div>
        <div>
          <dt className="text-fg-3">Quality / required</dt>
          <dd className="tnum text-sm font-medium text-fg">
            {Math.round(sel.quality.score)} / {sel.quality.required}
          </dd>
        </div>
        <div>
          <dt className="text-fg-3">External API cost</dt>
          <dd className={cn("tnum text-sm font-medium", local ? "text-local-fg" : "text-fg")}>{local ? "$0.00" : formatUsd(sel.cost.costUsd)}</dd>
        </div>
        <div>
          <dt className="text-fg-3">Est. latency</dt>
          <dd className="tnum text-sm font-medium text-fg">{formatMs(sel.latency.totalMs)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function DecisionPanel({ decision, compact }: { decision: RoutingDecision; compact?: boolean }) {
  const s = decision.summary;
  return (
    <div className="space-y-4">
      <Verdict decision={decision} />
      <div className="rounded-lg border border-line bg-surface p-3.5">
        <RouteMap decision={decision} />
      </div>
      <div className={cn("grid grid-cols-1 gap-4", !compact && "2xl:grid-cols-[minmax(0,1fr)_340px]")}>
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <SectionLabel>{s.considered} models considered</SectionLabel>
            <span className="text-xs text-fg-3">
              {s.eligible} permitted · {s.blockedByPolicy} blocked by policy · {s.belowThreshold} below threshold{s.unavailable ? ` · ${s.unavailable} unavailable` : ""}
            </span>
          </div>
          <CandidateList decision={decision} />
        </div>
        <div className="min-w-0">
          <SectionLabel className="mb-2">Why this route</SectionLabel>
          <div className="rounded-lg border border-line bg-surface p-4">
            <Rationale reasons={decision.rationale} />
            {decision.fallbackChain.length ? (
              <div className="mt-3 border-t border-line pt-3 text-xs text-fg-3">
                <span className="text-fg-2">Fallback chain:</span>{" "}
                {decision.fallbackChain.map((id) => decision.candidates.find((c) => c.modelId === id)?.shortName ?? id).join(" → ")}
                <div className="mt-1 text-fg-4">Only models that passed governance can be fallbacks.</div>
              </div>
            ) : decision.outcome === "routed" ? (
              <div className="mt-3 border-t border-line pt-3 text-xs text-fg-4">No fallback permitted for this request.</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
