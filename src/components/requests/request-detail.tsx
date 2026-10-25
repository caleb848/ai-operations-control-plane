import { CheckCircle2, FileLock2, FlaskConical, ListTree, ShieldBan, Unplug, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { DecisionDetails, ProfileChips, WhyList } from "@/components/routing/decision-panel";
import { EvaluationChecks, ExecutionSummaryStrip, OutputBanner, recordedReplay, ReviewSummary } from "@/components/routing/execution-result";
import { RouteFlow } from "@/components/routing/route-flow";
import { TraceTimeline } from "@/components/routing/trace-timeline";
import { ModeTag } from "@/components/ui/badges";
import { Disclosure } from "@/components/ui/disclosure";
import { LocalTime } from "@/components/ui/local-time";
import { Markdown } from "@/components/ui/markdown";
import type { Approval } from "@/services/approvals/approvals";
import type { ExecutionRecord } from "@/services/observability/types";
import { cn } from "@/lib/format";

const card = "card";

/**
 * A decision receipt: the route taken, what came back, the evidence around it
 * (review, evaluation, attempts) and, one click deeper, every candidate and
 * every trace step. Shared by the server page and the public demo's
 * session-copy fallback.
 */
export function RequestDetail({ r, approval, approvalSlot, sessionCopy }: { r: ExecutionRecord; approval?: Approval | null; approvalSlot?: ReactNode; sessionCopy?: boolean }) {
  const mode = r.status === "blocked" ? "blocked" : r.status === "failed" ? "failed" : recordedReplay(r) ? "recorded" : r.mode;
  return (
    <div className="space-y-8">
      <header>
        <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-fg-3">
          <span className="eyebrow">Decision</span>
          <span className="font-mono text-xs">{r.id}</span>
          <span aria-hidden>·</span>
          <LocalTime iso={r.createdAt} />
          <span aria-hidden>·</span>
          <span>{SOURCE[r.source]}</span>
        </div>
        <h1 className="max-w-4xl text-2xl font-semibold text-fg sm:text-3xl">{r.title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ProfileChips decision={r.decision} />
          <ModeTag mode={mode} />
        </div>
      </header>

      {r.source === "seed" || sessionCopy ? (
        <p className="flex items-start gap-2 text-sm text-fg-3">
          <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
          {sessionCopy
            ? "Shown from this browser session. The public demo keeps history in memory per server instance."
            : "Seeded demo request: the routing decision came from the real engine; execution and output are simulated."}
        </p>
      ) : null}

      <section aria-labelledby="route-title" className={cn(card, "p-5 sm:p-8")}>
        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="route-title" className="text-xl font-semibold text-fg">
            Route taken
          </h2>
          <span className="text-sm text-fg-3">Snapshot at request time · policy v{r.decision.policyVersion ?? 1}</span>
        </div>
        <RouteFlow decision={r.decision} record={r} animate={false} />
      </section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Result r={r} />
          <WhyList decision={r.decision} className={cn(card, "p-6")} />
        </div>
        <aside className="space-y-6" aria-label="Evidence">
          {r.status === "completed" ? (
            <section aria-labelledby="review-title" className={cn(card, "p-6")}>
              <h2 id="review-title" className="text-lg font-semibold text-fg">
                Human review
              </h2>
              {approval ? (
                <p className="text-sm text-fg-3">
                  {approval.status === "pending" ? (
                    "Held until a person approves it"
                  ) : (
                    <>Decided {approval.decidedAt ? <LocalTime iso={approval.decidedAt} /> : null}</>
                  )}
                </p>
              ) : null}
              <div className="mt-4 space-y-4">
                <ReviewSummary r={r} />
                {approval?.status === "pending" ? approvalSlot : null}
                {approval && approval.status !== "pending" ? (
                  <p className="rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-fg-2">
                    <span className="font-medium text-fg">{approval.reviewer ?? "Reviewer"}:</span> {approval.note ?? "No note"}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          {r.status === "completed" ? (
            <section aria-labelledby="eval-title" className={cn(card, "p-6")}>
              <h2 id="eval-title" className="text-lg font-semibold text-fg">
                Evaluation estimate{r.evalScore != null ? <span className="tnum text-fg-3"> · {r.evalScore}/100</span> : null}
              </h2>
              <p className="text-sm text-fg-3">Heuristic checks. LLM-as-judge is off by default.</p>
              <div className="mt-4">
                <EvaluationChecks r={r} />
              </div>
            </section>
          ) : null}

          {r.attempts.length ? (
            <section aria-labelledby="attempts-title" className={cn(card, "p-6")}>
              <h2 id="attempts-title" className="text-lg font-semibold text-fg">
                Attempts
              </h2>
              <p className="text-sm text-fg-3">
                {r.attempts.length} model attempt{r.attempts.length > 1 ? "s" : ""}. The same model is never retried.
              </p>
              <ol className="mt-4 space-y-2.5">
                {r.attempts.map((a, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    {a.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-fg-2" aria-label="succeeded" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger-ink" aria-label="failed" />}
                    <span className="min-w-0 flex-1 text-fg">{r.decision.candidates.find((c) => c.modelId === a.modelId)?.displayName ?? a.modelId}</span>
                    <span className="text-right text-fg-3">{a.ok ? MODE_LABEL[a.mode] : `${a.error?.code ?? "error"}${a.error?.simulated ? " (simulated)" : ""}`}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <section aria-labelledby="input-title" className={cn(card, "p-6")}>
            <h2 id="input-title" className="flex items-center gap-2 text-lg font-semibold text-fg">
              <FileLock2 className="size-[18px] text-fg-3" aria-hidden /> Input record
            </h2>
            <p className="text-sm text-fg-3">The raw input is not stored.</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="eyebrow">SHA-256</dt>
                <dd className="mt-1 break-all font-mono text-xs text-fg-2">{r.inputSha256}</dd>
              </div>
              <div>
                <dt className="eyebrow">Redacted preview</dt>
                <dd className="mt-1 break-words rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-xs leading-5 text-fg-2">{r.inputPreview}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>

      <DecisionDetails decision={r.decision} />
      <Disclosure title="Request trace" hint={`${r.trace.length} steps, in order, with timing`} icon={<ListTree className="size-[18px]" />}>
        <TraceTimeline events={r.trace} />
      </Disclosure>
    </div>
  );
}

const SOURCE: Record<ExecutionRecord["source"], string> = {
  console: "Route console",
  scenario: "Scenario",
  compare: "Comparison Lab",
  seed: "Seeded demo",
  api: "API",
};

const MODE_LABEL: Record<NonNullable<ExecutionRecord["mode"]>, string> = { local: "Local run", live: "Live API", demo: "Simulated" };

function Result({ r }: { r: ExecutionRecord }) {
  if (r.status === "completed" && r.outputText != null) {
    return (
      <section aria-labelledby="output-title" className={cn(card, "overflow-hidden")}>
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-6 pb-4 pt-6">
          <h2 id="output-title" className="text-xl font-semibold text-fg">
            Output
          </h2>
          {r.fallbackUsed ? <span className="text-sm font-medium text-review-ink">Served by a fallback model</span> : null}
        </div>
        <div className="border-t border-line">
          <OutputBanner r={r} />
        </div>
        <div className="scrollbar-thin max-h-[560px] overflow-y-auto px-6 py-5" tabIndex={0} aria-label="Model output">
          <Markdown text={r.outputText} />
        </div>
        <div className="border-t border-line px-6 py-5">
          <ExecutionSummaryStrip r={r} />
        </div>
      </section>
    );
  }
  const blocked = r.status === "blocked";
  const Icon = blocked ? ShieldBan : Unplug;
  return (
    <section aria-labelledby="output-title" className={cn("raised rounded-2xl border p-6", blocked ? "border-blocked-line bg-blocked-soft" : "border-danger-line bg-danger-soft")}>
      <div className="flex items-start gap-3.5">
        <Icon className={cn("mt-1 size-5 shrink-0", blocked ? "text-blocked-ink" : "text-danger-ink")} aria-hidden />
        <div>
          <h2 id="output-title" className="text-xl font-semibold text-fg">
            {blocked ? "Blocked before execution" : "Execution failed"}
          </h2>
          {r.error ? <p className="mt-1 text-md text-fg-2">{r.error}</p> : null}
          <p className="mt-2 text-sm text-fg-3">
            {blocked ? "Nothing was sent to any model. Failing closed is the policy working as designed." : "Every permitted model failed. No model outside policy was tried."}
          </p>
        </div>
      </div>
    </section>
  );
}
