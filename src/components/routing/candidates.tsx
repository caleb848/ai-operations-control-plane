import { Check, CircleAlert, Info, ShieldBan } from "lucide-react";
import type { ReactNode } from "react";
import { CandidateStatusBadge, DestinationDot } from "@/components/ui/badges";
import { Tip } from "@/components/ui/primitives";
import { PRIORITY_LABEL } from "@/core/routing/config";
import type { CandidateEvaluation, Factor, Reason, RoutingDecision } from "@/core/types";
import { cn, formatMs, formatUsd, PROVIDER_NAME } from "@/lib/format";
import { candidateWhy } from "@/lib/routing-view";

const FACTORS: { key: Factor; label: string }[] = [
  { key: "privacy", label: "Privacy" },
  { key: "cost", label: "Cost" },
  { key: "taskFit", label: "Task fit" },
  { key: "reasoning", label: "Reasoning" },
  { key: "latency", label: "Latency" },
];

const ORDER: Record<CandidateEvaluation["status"], number> = {
  selected: 0,
  eligible: 1,
  over_budget: 2,
  below_threshold: 3,
  blocked_policy: 4,
  unavailable: 5,
  context_exceeded: 6,
  disabled: 7,
};

function ScoreTip({ c, d }: { c: CandidateEvaluation; d: RoutingDecision }) {
  const w = d.weights;
  const r = (n: number) => n.toFixed(1);
  return (
    <div className="w-64 space-y-2">
      <div className="font-medium">
        {PRIORITY_LABEL[d.priorityMode]} score · {r(c.routingScore ?? 0)}
      </div>
      <table className="tnum w-full text-sm">
        <tbody>
          {FACTORS.map((f) => (
            <tr key={f.key}>
              <td className="py-0.5 text-fg-3">{f.label}</td>
              <td className="py-0.5 text-right text-fg-2">{Math.round(c.factors[f.key])}</td>
              <td className="py-0.5 text-right text-fg">+{r(c.contributions[f.key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-line pt-2 text-xs leading-4 text-fg-3">
        Weights: quality {w.quality} · cost {w.cost} · latency {w.latency} · privacy {w.privacy}. Quality above the {c.quality.required} bar counts at {Math.round(w.headroom * 100)}%. Task fit and
        reasoning come from configured capability profiles, not benchmarks.
      </div>
    </div>
  );
}

/** Quality as a bar against the task's bar: the tick is the requirement, the fill is the model. */
export function QualityBar({ c, className }: { c: CandidateEvaluation; className?: string }) {
  const meets = c.quality.meets;
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative h-1.5 flex-1 rounded-full bg-track" aria-hidden>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, c.quality.score)}%`, background: meets ? `var(--${c.location})` : "var(--fg-4)" }} />
        <span className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-fg" style={{ left: `${c.quality.required}%` }} />
      </div>
      <span className="tnum w-14 text-right text-sm text-fg-2">
        {Math.round(c.quality.score)}
        <span className="text-fg-3">/{c.quality.required}</span>
      </span>
    </div>
  );
}

export function CandidateList({ decision }: { decision: RoutingDecision }) {
  const rows = [...decision.candidates].sort((a, b) => ORDER[a.status] - ORDER[b.status] || (b.routingScore ?? -1) - (a.routingScore ?? -1));
  return (
    <div>
      <div className="mb-2 hidden grid-cols-[minmax(0,1.6fr)_minmax(140px,1fr)_minmax(150px,1fr)_84px_72px_56px] gap-4 px-4 lg:grid">
        {["Model", "Status", "Quality vs bar", "Est. cost", "Latency", "Score"].map((h, i) => (
          <span key={h} className={cn("eyebrow", i >= 3 && "text-right")}>
            {h}
          </span>
        ))}
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {rows.map((c) => (
          <CandidateRow key={c.modelId} c={c} d={decision} />
        ))}
      </ul>
    </div>
  );
}

function CandidateRow({ c, d }: { c: CandidateEvaluation; d: RoutingDecision }) {
  const selected = c.status === "selected";
  const gated = c.routingScore == null;
  const why = selected ? null : candidateWhy(c);
  return (
    <li className={cn("grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(140px,1fr)_minmax(150px,1fr)_84px_72px_56px] lg:items-center", selected && "bg-surface-2/70")}>
      <div className="col-span-2 min-w-0 lg:col-span-1">
        <div className="flex items-center gap-2.5">
          <DestinationDot destination={c.location} label={<span className={cn("truncate text-base font-medium", gated ? "text-fg-2" : "text-fg")}>{c.displayName}</span>} />
        </div>
        <div className="mt-0.5 truncate pl-[18px] text-sm text-fg-3">
          {PROVIDER_NAME[c.providerId]}
          {c.tier !== "local" ? ` · ${c.tier} tier` : ""}
        </div>
        {/* The reason wraps on its own line at every width; truncating it would hide why a model lost. */}
        {why ? <div className="mt-1 pl-[18px] text-sm text-fg-3">{why}</div> : null}
      </div>
      <div className="col-span-2 lg:col-span-1">
        <CandidateStatusBadge status={c.status} location={c.location} />
      </div>
      <div className="col-span-2 lg:col-span-1">{gated ? <span className="text-sm text-fg-3">Not scored</span> : <QualityBar c={c} />}</div>
      <div className="tnum text-left text-sm lg:text-right">
        <span className="text-fg-3 lg:hidden">Cost </span>
        {c.location === "local" ? <span className="text-local-ink">$0.00</span> : <span className={gated ? "text-fg-3" : "text-fg"}>{formatUsd(c.cost.costUsd)}</span>}
      </div>
      <div className="tnum text-right text-sm text-fg-2">
        <span className="text-fg-3 lg:hidden">Latency </span>
        {formatMs(c.latency.totalMs)}
      </div>
      <div className="col-span-2 flex justify-end lg:col-span-1">
        {gated ? (
          <span className="text-sm text-fg-3">—</span>
        ) : (
          <Tip content={<ScoreTip c={c} d={d} />} side="left">
            <button type="button" className="tnum inline-flex h-7 items-center rounded-md px-1.5 text-base font-semibold text-fg underline decoration-line-strong decoration-dotted underline-offset-4 hover:decoration-fg-3" aria-label={`Score ${Math.round(c.routingScore ?? 0)}, show breakdown`}>
              {Math.round(c.routingScore ?? 0)}
            </button>
          </Tip>
        )}
      </div>
    </li>
  );
}

const SEVERITY: Record<Reason["severity"], { icon: ReactNode; cls: string }> = {
  pass: { icon: <Check className="size-4" />, cls: "text-fg-2" },
  block: { icon: <ShieldBan className="size-4" />, cls: "text-blocked-ink" },
  warn: { icon: <CircleAlert className="size-4" />, cls: "text-review-ink" },
  info: { icon: <Info className="size-4" />, cls: "text-fg-3" },
};

/** The engine's complete reasoning, in its own words. */
export function Rationale({ reasons }: { reasons: Reason[] }) {
  return (
    <ul className="space-y-2">
      {reasons.map((r, i) => (
        <li key={`${r.code}-${i}`} className="flex items-start gap-2.5 text-sm">
          <span className={cn("mt-[2px] shrink-0", SEVERITY[r.severity].cls)}>{SEVERITY[r.severity].icon}</span>
          <span className={cn(r.severity === "block" ? "text-fg" : "text-fg-2")}>{r.message}</span>
        </li>
      ))}
    </ul>
  );
}

