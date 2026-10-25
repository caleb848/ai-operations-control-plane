import { ArrowUpRight, BadgeCheck, CheckCircle2, FlaskConical, History, Laptop, ListTree, Radio, UserRoundCheck, XCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { ExecutionRecord } from "@/services/observability/types";
import { DestinationBadge, ModeTag } from "@/components/ui/badges";
import { Disclosure } from "@/components/ui/disclosure";
import { Markdown } from "@/components/ui/markdown";
import { cn, formatMs, formatTokens, formatUsd, PROVIDER_NAME } from "@/lib/format";
import { routeOfRecord } from "@/lib/routing-view";
import { TraceTimeline } from "./trace-timeline";

type Rec = ExecutionRecord & { executedModelName?: string | null };

function modelName(r: Rec) {
  return r.executedModelName ?? r.decision.candidates.find((c) => c.modelId === r.executedModelId)?.displayName ?? r.executedModelId ?? "—";
}

/** The recorded-output trace event, when a simulated run replayed real local-model text. */
export function recordedReplay(r: Rec): string | null {
  return r.trace.find((e) => e.message === "Recorded local output replayed")?.detail ?? null;
}

/** Says plainly where the text came from: this device, a paid API, a recorded run, or a simulation. */
export function OutputBanner({ r }: { r: Rec }) {
  const recorded = recordedReplay(r);
  const row = (icon: ReactNode, strong: string, rest: ReactNode, tone?: string) => (
    <div className={cn("flex items-start gap-2.5 border-b border-line px-5 py-3 text-sm", tone ?? "bg-surface-2/60 text-fg-2")}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>
        <span className="font-medium text-fg">{strong}</span> {rest}
      </span>
    </div>
  );
  if (r.mode === "demo" && recorded) return row(<History className="size-4 text-fg-3" />, "Recorded run, replayed.", <>{recorded}. Not generated live: this deployment can&apos;t reach any model.</>);
  if (r.mode === "demo" && r.location === "local")
    return row(<FlaskConical className="size-4 text-fg-3" />, "Simulated output.", <>On a local install this request runs on {modelName(r)} through Ollama.</>);
  if (r.mode === "demo") return row(<FlaskConical className="size-4 text-fg-3" />, "Simulated output.", <>{modelName(r)} was not called; a simulated provider answered.</>);
  if (r.mode === "local") return row(<Laptop className="size-4 text-local-ink" />, "Generated on this device", <>by {modelName(r)} via Ollama. Nothing left the machine.</>, "bg-local-soft text-fg-2");
  return row(<Radio className="size-4 text-cloud-ink" />, "Live API response", <>from {modelName(r)} via {PROVIDER_NAME[r.executedProvider ?? "anthropic"]} · {formatUsd(r.externalCostUsd)}</>, "bg-cloud-soft text-fg-2");
}

export function ExecutionSummaryStrip({ r }: { r: Rec }) {
  const items: { label: string; value: string; hint?: string }[] = [
    { label: "Latency", value: formatMs(r.latencyMs), hint: r.latencySource === "recorded" ? "recorded on the developer's Mac" : (r.latencySource ?? undefined) },
    { label: "Tokens", value: r.inputTokens != null ? `${formatTokens(r.inputTokens)} → ${formatTokens(r.outputTokens)}` : "—", hint: r.tokenSource ?? undefined },
    ...(r.outputTps ? [{ label: "Throughput", value: `${r.outputTps.toFixed(1)} tok/s`, hint: "measured" }] : []),
    { label: "External cost", value: formatUsd(r.externalCostUsd), hint: r.mode === "demo" ? `${formatUsd(r.simulatedCostUsd)} simulated` : r.mode === "local" ? "local compute" : "actual" },
    { label: "Evaluation", value: r.evalScore != null ? `${r.evalScore}/100` : "Not evaluated", hint: r.evalScore != null ? "heuristic estimate" : "simulated text" },
  ];
  return (
    <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-4", items.length === 5 ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-4")}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="eyebrow">{i.label}</dt>
          <dd className="tnum mt-1 text-lg font-semibold text-fg">{i.value}</dd>
          {i.hint ? <dd className="text-sm text-fg-3">{i.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

export function EvaluationChecks({ r }: { r: Rec }) {
  if (!r.evaluation)
    return (
      <div className="text-sm text-fg-3">
        {r.status === "completed" ? "Not evaluated: this output is simulated, so there is no real model text to check." : "No evaluation: the request did not run."}
      </div>
    );
  return (
    <ul className="space-y-2">
      {r.evaluation.checks.map((c) => (
        <li key={c.id} className="flex items-start gap-2.5 text-sm">
          {c.passed ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-fg-2" aria-label="passed" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-review-ink" aria-label="failed" />}
          <span className="flex-1">
            <span className="text-fg">{c.label}</span>
            <span className="ml-1.5 text-fg-3">{c.detail}</span>
          </span>
          <span className="tnum text-fg-3">{c.weight}</span>
        </li>
      ))}
    </ul>
  );
}

export function ReviewSummary({ r, approvalHref }: { r: Rec; approvalHref?: string }) {
  if (!r.review) return <div className="text-sm text-fg-3">Not applicable: the request did not run.</div>;
  if (!r.review.required)
    return (
      <div className="flex items-center gap-2 text-sm text-fg-2">
        <BadgeCheck className="size-4 text-fg-3" /> No human review required by policy.
      </div>
    );
  const label = { pending: "Awaiting review", approved: "Approved", rejected: "Rejected", not_required: "Not required" }[r.reviewStatus];
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 text-md font-medium text-fg">
        <UserRoundCheck className={cn("size-[18px]", r.reviewStatus === "rejected" ? "text-danger-ink" : r.reviewStatus === "approved" ? "text-fg-2" : "text-review-ink")} /> {label}
      </div>
      <ul className="space-y-1 text-sm text-fg-2">
        {r.review.reasons.map((x) => (
          <li key={x.code}>{x.message}</li>
        ))}
      </ul>
      {approvalHref && r.reviewStatus === "pending" ? (
        <Link href={approvalHref} className="inline-flex items-center gap-1 text-sm font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg-3">
          Open the review queue <ArrowUpRight className="size-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

export function ExecutionResult({ r, showTrace = true }: { r: Rec; showTrace?: boolean }) {
  const ok = r.status === "completed";
  const route = routeOfRecord(r);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {route !== "failed" ? <DestinationBadge destination={route} size="md" /> : null}
        <h3 className="text-xl font-semibold text-fg">{ok ? `Completed on ${modelName(r)}` : r.status === "blocked" ? "Blocked before execution" : "Execution failed"}</h3>
        <ModeTag mode={r.status === "blocked" ? "blocked" : r.status === "failed" ? "failed" : recordedReplay(r) ? "recorded" : r.mode} />
        {r.fallbackUsed ? <span className="text-sm text-review-ink">Fallback used</span> : null}
        <Link href={`/requests/${r.id}`} className="ml-auto inline-flex items-center gap-1 font-mono text-xs text-fg-3 hover:text-fg">
          {r.id} <ArrowUpRight className="size-3.5" />
        </Link>
      </div>

      {ok && r.outputText != null ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <OutputBanner r={r} />
          <div className="scrollbar-thin max-h-[520px] overflow-y-auto px-5 py-4" tabIndex={0} aria-label="Model output">
            <Markdown text={r.outputText} />
          </div>
        </div>
      ) : r.error ? (
        <div className={cn("rounded-xl border px-5 py-4 text-sm text-fg", r.status === "blocked" ? "border-blocked-line bg-blocked-soft" : "border-danger-line bg-danger-soft")}>{r.error}</div>
      ) : null}

      {ok ? <ExecutionSummaryStrip r={r} /> : null}

      {ok ? (
        <div className="grid grid-cols-1 gap-6 border-t border-line pt-6 md:grid-cols-2">
          <div>
            <div className="eyebrow mb-3">Evaluation estimate{r.evalScore != null ? ` · ${r.evalScore}/100` : ""}</div>
            <EvaluationChecks r={r} />
          </div>
          <div>
            <div className="eyebrow mb-3">Human review</div>
            <ReviewSummary r={r} approvalHref="/approvals" />
          </div>
        </div>
      ) : null}

      {showTrace ? (
        <Disclosure title="Decision trace" hint={`${r.trace.length} steps, in order`} icon={<ListTree className="size-[18px]" />}>
          <TraceTimeline events={r.trace} live />
        </Disclosure>
      ) : null}
    </div>
  );
}
