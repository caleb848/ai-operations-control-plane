import { ArrowUpRight, Ban, BadgeCheck, CheckCircle2, CircleAlert, FlaskConical, HardDrive, Radio, XCircle } from "lucide-react";
import Link from "next/link";
import type { ExecutionRecord } from "@/services/observability/types";
import { Markdown } from "@/components/ui/markdown";
import { ModeBadge } from "@/components/ui/badges";
import { SectionLabel } from "@/components/ui/primitives";
import { cn, formatMs, formatTokens, formatUsd, PROVIDER_NAME } from "@/lib/format";
import { TraceTimeline } from "./trace-timeline";

type Rec = ExecutionRecord & { executedModelName?: string | null };

function modelName(r: Rec) {
  return r.executedModelName ?? r.decision.candidates.find((c) => c.modelId === r.executedModelId)?.displayName ?? r.executedModelId ?? "—";
}

/** The recorded-output trace event, when a simulated run replayed real local-model text. */
export function recordedReplay(r: Rec): string | null {
  return r.trace.find((e) => e.message === "Recorded local output replayed")?.detail ?? null;
}

/** Output banner: makes clear whether text came from a real model on this device, a paid API, a recorded run, or MockProvider. */
export function OutputBanner({ r }: { r: Rec }) {
  const recorded = recordedReplay(r);
  if (r.mode === "demo" && recorded)
    return (
      <div className="hatch flex items-center gap-2 border-b border-warn/30 px-4 py-2 text-xs text-warn-fg">
        <FlaskConical className="size-3.5 shrink-0" />
        <span>
          <span className="font-semibold">Recorded local output, replayed.</span> {recorded}. Not generated live: this deployment cannot reach any model.
        </span>
      </div>
    );
  if (r.mode === "demo" && r.location === "local")
    return (
      <div className="hatch flex items-center gap-2 border-b border-warn/30 px-4 py-2 text-xs text-warn-fg">
        <FlaskConical className="size-3.5 shrink-0" />
        <span>
          <span className="font-semibold">Simulated output.</span> On a local installation this request would execute through Ollama ({modelName(r)}).
        </span>
      </div>
    );
  if (r.mode === "demo")
    return (
      <div className="hatch flex items-center gap-2 border-b border-warn/30 px-4 py-2 text-xs text-warn-fg">
        <FlaskConical className="size-3.5" />
        <span>
          <span className="font-semibold">Simulated output.</span> {modelName(r)} was not called; MockProvider answered because cloud is in DEMO mode.
        </span>
      </div>
    );
  if (r.mode === "local")
    return (
      <div className="flex items-center gap-2 border-b border-local-line bg-local-soft px-4 py-2 text-xs text-local-fg">
        <HardDrive className="size-3.5" />
        <span>
          <span className="font-semibold">Generated on this device</span> by {modelName(r)} via Ollama · nothing left the machine
        </span>
      </div>
    );
  return (
    <div className="flex items-center gap-2 border-b border-cloud-line bg-cloud-soft px-4 py-2 text-xs text-cloud-fg">
      <Radio className="size-3.5" />
      <span>
        <span className="font-semibold">Live API response</span> from {modelName(r)} via {PROVIDER_NAME[r.executedProvider ?? "anthropic"]} · {formatUsd(r.externalCostUsd)}
      </span>
    </div>
  );
}

export function ExecutionSummaryStrip({ r }: { r: Rec }) {
  const items: { label: string; value: string; hint?: string }[] = [
    { label: "Latency", value: formatMs(r.latencyMs), hint: r.latencySource === "recorded" ? "recorded on developer's Mac" : (r.latencySource ?? undefined) },
    { label: "Tokens", value: r.inputTokens != null ? `${formatTokens(r.inputTokens)} → ${formatTokens(r.outputTokens)}` : "—", hint: r.tokenSource ?? undefined },
    ...(r.outputTps ? [{ label: "Throughput", value: `${r.outputTps.toFixed(1)} tok/s`, hint: "measured" }] : []),
    { label: "External API cost", value: formatUsd(r.externalCostUsd), hint: r.mode === "demo" ? `${formatUsd(r.simulatedCostUsd)} simulated` : r.mode === "local" ? "local compute" : "actual" },
    { label: "Evaluation", value: r.evalScore != null ? `${r.evalScore}/100` : "Not evaluated", hint: r.evalScore != null ? "heuristic" : "simulated text" },
  ];
  return (
    <div className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line", items.length === 5 ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-4")}>
      {items.map((i) => (
        <div key={i.label} className="bg-surface px-3 py-2">
          <div className="text-2xs text-fg-3">{i.label}</div>
          <div className="tnum text-sm font-medium text-fg">{i.value}</div>
          {i.hint ? <div className="text-2xs text-fg-4">{i.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function EvaluationChecks({ r }: { r: Rec }) {
  if (!r.evaluation)
    return (
      <div className="text-xs text-fg-3">
        {r.status === "completed" ? "Not evaluated: this output is simulated, so there is no real model text to check." : "No evaluation (request not executed)."}
      </div>
    );
  return (
    <ul className="space-y-1.5">
      {r.evaluation.checks.map((c) => (
        <li key={c.id} className="flex items-start gap-2 text-xs">
          {c.passed ? <CheckCircle2 className="mt-px size-3.5 shrink-0 text-ok-fg" /> : <XCircle className="mt-px size-3.5 shrink-0 text-warn-fg" />}
          <span className="flex-1">
            <span className="text-fg">{c.label}</span>
            <span className="ml-1.5 text-fg-3">{c.detail}</span>
          </span>
          <span className="tnum text-fg-4">{c.weight}</span>
        </li>
      ))}
    </ul>
  );
}

export function ReviewSummary({ r, approvalHref }: { r: Rec; approvalHref?: string }) {
  if (!r.review) return <div className="text-xs text-fg-4">Not applicable.</div>;
  if (!r.review.required)
    return (
      <div className="flex items-center gap-2 text-xs text-fg-2">
        <BadgeCheck className="size-3.5 text-ok-fg" /> No human review required by policy.
      </div>
    );
  const label = { pending: "Awaiting review", approved: "Approved", rejected: "Rejected", not_required: "Not required" }[r.reviewStatus];
  return (
    <div className="space-y-2">
      <div className={cn("flex items-center gap-2 text-sm font-medium", r.reviewStatus === "pending" ? "text-warn-fg" : r.reviewStatus === "approved" ? "text-ok-fg" : "text-danger-fg")}>
        <CircleAlert className="size-4" /> {label}
      </div>
      <ul className="space-y-1 text-xs text-fg-2">
        {r.review.reasons.map((x) => (
          <li key={x.code}>· {x.message}</li>
        ))}
      </ul>
      {approvalHref && r.reviewStatus === "pending" ? (
        <Link href={approvalHref} className="inline-flex items-center gap-1 text-xs font-medium text-fg hover:underline">
          Open in approvals <ArrowUpRight className="size-3" />
        </Link>
      ) : null}
    </div>
  );
}

export function ExecutionResult({ r, showTrace = true }: { r: Rec; showTrace?: boolean }) {
  const ok = r.status === "completed";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        {ok ? <CheckCircle2 className="size-4 text-ok-fg" /> : r.status === "blocked" ? <Ban className="size-4 text-blocked-fg" /> : <XCircle className="size-4 text-danger-fg" />}
        <span className="text-sm font-medium text-fg">{ok ? `Completed on ${modelName(r)}` : r.status === "blocked" ? "Blocked before execution" : "Execution failed"}</span>
        <ModeBadge mode={r.status === "blocked" ? "blocked" : r.status === "failed" ? "failed" : r.mode} />
        {r.fallbackUsed ? <span className="rounded border border-warn/35 bg-warn-soft px-1.5 text-2xs leading-[18px] text-warn-fg">fallback used</span> : null}
        <Link href={`/requests/${r.id}`} className="ml-auto inline-flex items-center gap-1 font-mono text-xs text-fg-3 hover:text-fg">
          {r.id} <ArrowUpRight className="size-3" />
        </Link>
      </div>

      {ok ? <ExecutionSummaryStrip r={r} /> : null}

      {ok && r.outputText != null ? (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <OutputBanner r={r} />
          <div className={cn("max-h-[520px] overflow-y-auto px-4 py-3.5 scrollbar-thin", r.mode === "demo" && "opacity-90")}>
            <Markdown text={r.outputText} />
          </div>
        </div>
      ) : r.error ? (
        <div className="rounded-lg border border-blocked-line bg-blocked-soft px-4 py-3 text-sm text-fg">{r.error}</div>
      ) : null}

      {ok ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-line bg-surface p-4">
            <SectionLabel className="mb-2.5">Evaluation estimate{r.evalScore != null ? ` · ${r.evalScore}/100` : ""}</SectionLabel>
            <EvaluationChecks r={r} />
          </div>
          <div className="rounded-lg border border-line bg-surface p-4">
            <SectionLabel className="mb-2.5">Human review</SectionLabel>
            <ReviewSummary r={r} approvalHref="/approvals" />
          </div>
        </div>
      ) : null}

      {showTrace ? (
        <div className="rounded-lg border border-line bg-surface p-4">
          <SectionLabel className="mb-2">Request trace</SectionLabel>
          <TraceTimeline events={r.trace} live />
        </div>
      ) : null}
    </div>
  );
}
