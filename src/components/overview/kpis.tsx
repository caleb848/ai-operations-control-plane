import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { SplitBar } from "@/components/charts/charts";
import { Tip } from "@/components/ui/primitives";
import type { OverviewMetrics } from "@/services/observability/repository";
import { formatCount, formatUsd } from "@/lib/format";

function Kpi({ label, value, sub, tip, children }: { label: string; value: ReactNode; sub?: ReactNode; tip?: string; children?: ReactNode }) {
  return (
    <div className="min-w-0 bg-surface px-4 py-3.5">
      <div className="flex items-center gap-1 text-xs text-fg-3">
        {label}
        {tip ? (
          <Tip content={tip}>
            <button type="button" aria-label={`About ${label}`} className="text-fg-4 transition-colors hover:text-fg-2">
              <Info className="size-3" />
            </button>
          </Tip>
        ) : null}
      </div>
      <div className="mt-1.5 text-[22px] font-semibold leading-7 tracking-[-0.02em] text-fg">{value}</div>
      {children}
      {sub ? <div className="mt-1 truncate text-xs text-fg-3">{sub}</div> : null}
    </div>
  );
}

export function KpiStrip({ m, baselineName }: { m: OverviewMetrics; baselineName: string }) {
  const routed = m.local + m.cloud;
  const localShare = routed ? m.local / routed : 0;
  const avoided = Math.max(0, m.baselineSpendUsd - m.externalSpendUsd - m.simulatedSpendUsd);
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
      <Kpi label="Local vs cloud" value={`${Math.round(localShare * 100)}% local`} tip="Share of routed (non-blocked) requests that ran on a local Ollama model.">
        <SplitBar
          className="mt-2"
          height={6}
          parts={[
            { key: "local", value: m.local, color: "var(--local)", label: "Local" },
            { key: "cloud", value: m.cloud, color: "var(--cloud)", label: "Cloud" },
            { key: "blocked", value: m.blocked + m.failed, color: "var(--blocked)", label: "Blocked / failed" },
          ]}
        />
        <div className="mt-1.5 flex gap-2.5 text-xs text-fg-3">
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-local" />
            <span className="tnum text-fg">{m.local}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-cloud" />
            <span className="tnum text-fg">{m.cloud}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-blocked" />
            <span className="tnum text-fg">{m.blocked}</span>
          </span>
          <span className="ml-auto tnum">{formatCount(m.total)} total</span>
        </div>
      </Kpi>
      <Kpi
        label="External API spend"
        value={formatUsd(m.externalSpendUsd)}
        sub={m.simulatedSpendUsd > 0 ? `+ ${formatUsd(m.simulatedSpendUsd)} simulated (demo)` : "real, paid API calls only"}
        tip="Actual spend on paid cloud APIs, from provider-reported tokens at list price. Simulated demo executions are counted separately and never added here."
      />
      <Kpi
        label="API spend avoided"
        value={formatUsd(avoided)}
        sub={`vs. all-${baselineName.replace("Claude ", "")} baseline`}
        tip={`Estimated cost if every completed request had gone to ${baselineName} at list price, minus actual and simulated spend. Zero API cost is not zero compute cost: local inference still uses this machine's time and power.`}
      />
      <Kpi
        label="Avg evaluation"
        value={m.avgEval != null ? Math.round(m.avgEval) : "—"}
        sub="heuristic estimate · 0–100"
        tip="Deterministic output checks (completeness, structure, grounding, truncation, refusals, PII echo). A screening signal, not a benchmark. LLM-as-judge is off by default."
      />
      <Kpi
        label="Human reviews"
        value={
          <span>
            {m.reviewsPending}
            <span className="ml-1.5 text-sm font-normal text-fg-3">pending</span>
          </span>
        }
        sub={`${m.reviewsCompleted} completed · ${m.reviewsRequired} required`}
        tip="Outputs held for a person to approve: confidential or restricted data, high business risk, low evaluation, or a missed quality threshold."
      />
      <Kpi
        label="Cloud blocked by policy"
        value={formatCount(m.policyBlockedRequests)}
        sub={`${m.blocked} fully blocked · ${m.budgetGuardEvents} budget reroute${m.budgetGuardEvents === 1 ? "" : "s"}`}
        tip="Requests where governance kept at least one cloud model from receiving the data. Fully blocked requests were not executed by any model."
      />
    </div>
  );
}
