import { ArrowLeft, FlaskConical } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ApprovalActions } from "@/components/approvals/approval-actions";
import { DecisionPanel, ProfileChips } from "@/components/routing/decision-panel";
import { EvaluationChecks, ExecutionSummaryStrip, OutputBanner, ReviewSummary } from "@/components/routing/execution-result";
import { TraceTimeline } from "@/components/routing/trace-timeline";
import { ModeBadge } from "@/components/ui/badges";
import { Markdown } from "@/components/ui/markdown";
import { KeyValue, Panel, PanelHeader, SectionLabel, Skeleton } from "@/components/ui/primitives";
import { SessionRecordView } from "@/components/routing/session-record-view";
import { loadConfig } from "@/config/env";
import { requestDetail } from "@/server/queries";
import { shortDateTime } from "@/lib/format";

export default function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="mx-auto max-w-[1440px]">
      <Link href="/requests" className="mb-3 inline-flex items-center gap-1 text-xs text-fg-3 hover:text-fg">
        <ArrowLeft className="size-3.5" /> Requests
      </Link>
      <Suspense fallback={<Skeleton className="h-[720px] w-full rounded-lg" />}>
        <Detail params={params} />
      </Suspense>
    </div>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await requestDetail(id);
  if (!data) {
    // Public demo: history is per server instance; fall back to this visitor's own session copy.
    if (loadConfig().deployment.mode === "portfolio") return <SessionRecordView id={id} />;
    notFound();
  }
  const { record: r, approval } = data;
  const seed = r.source === "seed";

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-fg-3">
            <span className="font-mono">{r.id}</span>
            <span>·</span>
            <span>{shortDateTime(r.createdAt)}</span>
            <span>·</span>
            <span>source: {r.source}</span>
          </div>
          <h1 className="max-w-4xl text-[19px] font-semibold leading-7 tracking-[-0.015em] text-fg">{r.title}</h1>
          <div className="mt-2">
            <ProfileChips decision={r.decision} />
          </div>
        </div>
        <ModeBadge mode={r.status === "blocked" ? "blocked" : r.status === "failed" ? "failed" : r.mode} />
      </div>

      {seed ? (
        <div className="hatch mb-4 flex items-center gap-2 rounded-lg border border-warn/30 px-3.5 py-2 text-xs text-fg-2">
          <FlaskConical className="size-3.5 text-warn-fg" /> Seeded demo request: the routing decision was computed by the real engine; execution and output are simulated.
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          {r.status === "completed" ? <ExecutionSummaryStrip r={r} /> : null}
          {r.outputText != null ? (
            <Panel className="overflow-hidden">
              <OutputBanner r={r} />
              <div className="scrollbar-thin max-h-[560px] overflow-y-auto px-4 py-3.5">
                <Markdown text={r.outputText} />
              </div>
            </Panel>
          ) : r.error ? (
            <div className="rounded-lg border border-blocked-line bg-blocked-soft px-4 py-3 text-sm text-fg">{r.error}</div>
          ) : null}
          <Panel>
            <PanelHeader title="Routing decision" description={`Snapshot taken at request time · policy v${r.decision.policyVersion ?? 1}`} />
            <div className="p-4">
              <DecisionPanel decision={r.decision} compact />
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          {approval ? (
            <Panel>
              <PanelHeader title="Human review" description={approval.status === "pending" ? "Held for approval" : `Decided ${approval.decidedAt ? shortDateTime(approval.decidedAt) : ""}`} />
              <div className="space-y-3 p-4">
                <ReviewSummary r={r} />
                {approval.status === "pending" ? (
                  <ApprovalActions approvalId={approval.id} />
                ) : (
                  <div className="rounded-md border border-line bg-surface-2 px-3 py-2 text-xs text-fg-2">
                    {approval.reviewer}: {approval.note ?? "No note"}
                  </div>
                )}
              </div>
            </Panel>
          ) : null}
          {r.evaluation ? (
            <Panel>
              <PanelHeader title={`Evaluation estimate · ${r.evalScore}/100`} description="Heuristic checks; LLM-as-judge is off by default" />
              <div className="p-4">
                <EvaluationChecks r={r} />
              </div>
            </Panel>
          ) : null}
          {r.attempts.length ? (
            <Panel>
              <PanelHeader title="Attempts" description={`${r.attempts.length} model attempt${r.attempts.length > 1 ? "s" : ""} · never retried the same model`} />
              <ul className="divide-y divide-line">
                {r.attempts.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 px-4 py-2 text-xs">
                    <span className={a.ok ? "text-ok-fg" : "text-danger-fg"}>{a.ok ? "✓" : "✕"}</span>
                    <span className="flex-1 text-fg">{r.decision.candidates.find((c) => c.modelId === a.modelId)?.shortName ?? a.modelId}</span>
                    <span className="text-fg-3">{a.ok ? a.mode.toUpperCase() : `${a.error?.code}${a.error?.simulated ? " (simulated)" : ""}`}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          <Panel>
            <PanelHeader title="Request trace" />
            <div className="p-4">
              <TraceTimeline events={r.trace} />
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Input record" description="Raw input is not stored" />
            <div className="space-y-2 p-4">
              <KeyValue label="SHA-256">
                <span className="font-mono text-2xs">{r.inputSha256.slice(0, 24)}…</span>
              </KeyValue>
              <div>
                <SectionLabel className="mb-1">Redacted preview</SectionLabel>
                <p className="break-words rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-2xs leading-4 text-fg-3">{r.inputPreview}</p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
