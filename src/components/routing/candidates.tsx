import { Ban, CheckCircle2, CircleAlert, Info } from "lucide-react";
import type { ReactNode } from "react";
import { FactorBar } from "@/components/charts/charts";
import { CandidateStatusBadge } from "@/components/ui/badges";
import { Tip } from "@/components/ui/primitives";
import { PRIORITY_LABEL } from "@/core/routing/config";
import type { CandidateEvaluation, Factor, Reason, RoutingDecision } from "@/core/types";
import { cn, formatMs, formatUsd, PROVIDER_NAME } from "@/lib/format";

const FACTORS: { key: Factor; label: string }[] = [
  { key: "privacy", label: "Privacy" },
  { key: "cost", label: "Cost" },
  { key: "taskFit", label: "Task fit" },
  { key: "reasoning", label: "Reasoning" },
  { key: "latency", label: "Latency" },
];

const GATED = new Set(["blocked_policy", "unavailable", "disabled", "context_exceeded"]);

function ScoreTip({ c, d }: { c: CandidateEvaluation; d: RoutingDecision }) {
  const w = d.weights;
  const r = (n: number) => n.toFixed(1);
  return (
    <div className="w-60 space-y-1">
      <div className="font-medium">
        {PRIORITY_LABEL[d.priorityMode]} score · {r(c.routingScore ?? 0)}
      </div>
      <table className="tnum w-full text-2xs">
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
      <div className="border-t border-line pt-1 text-2xs text-fg-3">
        Weights: quality {w.quality} · cost {w.cost} · latency {w.latency} · privacy {w.privacy}. Quality above the {c.quality.required} requirement counts at {Math.round(w.headroom * 100)}%.
      </div>
    </div>
  );
}

function mainReason(c: CandidateEvaluation): Reason | undefined {
  return (
    c.reasons.find((r) => r.severity === "block") ??
    c.reasons.find((r) => r.code === "prefer_local" || r.code === "budget_prefers") ??
    c.reasons.find((r) => r.severity === "warn" && r.code !== "truncation_risk")
  );
}

function CandidateCard({ c, d, index }: { c: CandidateEvaluation; d: RoutingDecision; index: number }) {
  const selected = c.status === "selected";
  const color = c.location === "local" ? "var(--local)" : "var(--cloud)";
  const muted = c.status === "below_threshold" || c.status === "over_budget";
  const why = mainReason(c);
  return (
    <div
      className={cn(
        "grid animate-rise grid-cols-1 gap-x-5 gap-y-3 rounded-lg border px-4 py-3.5 transition-colors sm:grid-cols-[minmax(180px,1fr)_minmax(220px,1.25fr)_104px]",
        selected ? (c.location === "local" ? "border-local-line bg-local-soft" : "border-cloud-line bg-cloud-soft") : "border-line bg-surface",
      )}
      style={{ animationDelay: `${index * 35}ms` }}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <CandidateStatusBadge status={c.status} location={c.location} />
        </div>
        <div className="mt-2 text-[15px] font-semibold tracking-[-0.01em] text-fg">{c.displayName}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-3">
          <span className="size-1.5 rounded-full" style={{ background: color }} />
          {c.location === "local" ? "Local" : "Cloud"} · {PROVIDER_NAME[c.providerId]}
          {c.tier !== "local" ? ` · ${c.tier} tier` : ""}
        </div>
        {why ? (
          <div className={cn("mt-2 text-xs", why.severity === "block" ? "text-blocked-fg" : why.severity === "warn" ? "text-warn-fg" : "text-fg-3")}>{why.message}</div>
        ) : selected ? (
          <div className="mt-2 text-xs text-fg-2">{c.location === "local" ? "Data never leaves the local machine" : "Approved provider for this classification"}</div>
        ) : null}
      </div>
      <div className="space-y-1.5 self-center">
        {FACTORS.map((f) => (
          <FactorBar key={f.key} label={f.label} value={c.factors[f.key]} color={color} muted={muted} />
        ))}
        <div className="pl-[72px] text-2xs text-fg-4">Task fit and reasoning from a configured profile, not a benchmark</div>
      </div>
      <div className="flex flex-row items-end justify-between gap-2 sm:flex-col sm:items-end sm:justify-center sm:text-right">
        <Tip content={<ScoreTip c={c} d={d} />} side="left">
          <button type="button" className="text-right">
            <div className={cn("tnum text-[28px] font-semibold leading-8 tracking-[-0.03em]", selected ? "text-fg" : muted ? "text-fg-3" : "text-fg-2")}>
              {c.routingScore != null ? Math.round(c.routingScore) : "—"}
            </div>
            <div className="text-2xs text-fg-3 underline decoration-dotted decoration-fg-4 underline-offset-2">{muted ? "score · not eligible" : "routing score"}</div>
          </button>
        </Tip>
        <div className="space-y-0.5 text-xs">
          <div className={cn("tnum", c.location === "local" ? "text-local-fg" : "text-fg-2")}>{c.location === "local" ? "$0.00 API" : formatUsd(c.cost.costUsd)}</div>
          <div className="tnum text-fg-3">
            {formatMs(c.latency.totalMs)}
            {c.latency.source === "measured" ? "" : " est."}
          </div>
          <div className="tnum text-fg-4">
            Q {Math.round(c.quality.score)}/{c.quality.required}
          </div>
        </div>
      </div>
    </div>
  );
}

function GatedRow({ c, index }: { c: CandidateEvaluation; index: number }) {
  const why = mainReason(c);
  return (
    <div className="flex animate-rise flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-surface px-4 py-2.5" style={{ animationDelay: `${index * 35}ms` }}>
      <div className="flex min-w-[220px] items-center gap-2.5">
        <span className="size-1.5 rounded-full" style={{ background: c.location === "local" ? "var(--local)" : "var(--cloud)", opacity: 0.6 }} />
        <span className="text-sm font-medium text-fg-2">{c.displayName}</span>
        <CandidateStatusBadge status={c.status} location={c.location} />
      </div>
      <div className={cn("min-w-[200px] flex-1 text-xs", c.status === "blocked_policy" ? "text-blocked-fg" : c.status === "unavailable" ? "text-danger-fg" : "text-fg-3")}>{why?.message}</div>
      {c.location === "cloud" && c.status === "blocked_policy" ? (
        <Tip content="What this request would have cost on this model if policy allowed it. Not spent.">
          <span className="tnum text-xs text-fg-4">would cost {formatUsd(c.cost.costUsd)}</span>
        </Tip>
      ) : null}
    </div>
  );
}

export function CandidateList({ decision }: { decision: RoutingDecision }) {
  const scored = decision.candidates.filter((c) => !GATED.has(c.status));
  const gated = decision.candidates.filter((c) => GATED.has(c.status));
  return (
    <div className="space-y-2">
      {scored.map((c, i) => (
        <CandidateCard key={c.modelId} c={c} d={decision} index={i} />
      ))}
      {gated.map((c, i) => (
        <GatedRow key={c.modelId} c={c} index={scored.length + i} />
      ))}
    </div>
  );
}

const SEVERITY: Record<Reason["severity"], { icon: ReactNode; cls: string }> = {
  pass: { icon: <CheckCircle2 className="size-3.5" />, cls: "text-ok-fg" },
  block: { icon: <Ban className="size-3.5" />, cls: "text-blocked-fg" },
  warn: { icon: <CircleAlert className="size-3.5" />, cls: "text-warn-fg" },
  info: { icon: <Info className="size-3.5" />, cls: "text-fg-3" },
};

export function Rationale({ reasons }: { reasons: Reason[] }) {
  return (
    <ul className="space-y-1.5">
      {reasons.map((r, i) => (
        <li key={`${r.code}-${i}`} className="flex items-start gap-2 text-sm">
          <span className={cn("mt-[2px] shrink-0", SEVERITY[r.severity].cls)}>{SEVERITY[r.severity].icon}</span>
          <span className={cn(r.severity === "block" ? "text-fg" : "text-fg-2")}>{r.message}</span>
        </li>
      ))}
    </ul>
  );
}
