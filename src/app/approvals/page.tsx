import { BadgeCheck, CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ApprovalActions } from "@/components/approvals/approval-actions";
import { OutputBanner } from "@/components/routing/execution-result";
import { ClassificationBadge, LocationChip, ModeBadge } from "@/components/ui/badges";
import { Markdown } from "@/components/ui/markdown";
import { PageHeader } from "@/components/ui/page-header";
import { Empty, KeyValue, Panel, PanelHeader, SectionLabel, Skeleton } from "@/components/ui/primitives";
import { approvalsData } from "@/server/queries";
import { cn, formatMs, formatUsd, relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Approvals" };

export default function ApprovalsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Human review"
        description="Outputs held by policy before anyone uses them: confidential or restricted data, high business risk, low evaluation estimates, or a missed quality threshold."
      />
      <Suspense fallback={<Skeleton className="h-[640px] w-full rounded-lg" />}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Queue({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const { pending, decided } = await approvalsData();
  const all = [...pending, ...decided];
  const current = all.find((x) => x.approval.id === id) ?? pending[0] ?? decided[0];

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Panel className="overflow-hidden">
        <PanelHeader title="Pending" description={`${pending.length} awaiting a decision`} />
        {pending.length === 0 ? (
          <Empty title="Queue is clear" icon={<BadgeCheck className="size-6" />}>
            Nothing is waiting for review.
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {pending.map((x) => (
              <Item key={x.approval.id} x={x} active={current?.approval.id === x.approval.id} />
            ))}
          </ul>
        )}
        {decided.length ? (
          <>
            <div className="border-y border-line bg-surface-2 px-4 py-2">
              <SectionLabel>Recently decided</SectionLabel>
            </div>
            <ul className="scrollbar-thin max-h-[360px] divide-y divide-line overflow-y-auto">
              {decided.map((x) => (
                <Item key={x.approval.id} x={x} active={current?.approval.id === x.approval.id} />
              ))}
            </ul>
          </>
        ) : null}
      </Panel>

      {current ? (
        <div className="min-w-0 space-y-4">
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-fg">{current.execution.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <ClassificationBadge value={current.execution.classification} size="xs" />
                  <LocationChip location={current.execution.location} size="xs" />
                  <ModeBadge mode={current.execution.mode} size="xs" />
                  <Link href={`/requests/${current.execution.id}`} className="font-mono text-2xs text-fg-3 hover:text-fg">
                    {current.execution.id}
                  </Link>
                </div>
              </div>
              <StatusPill status={current.approval.status} />
            </div>
            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(0,1fr)_260px]">
              <div className="min-w-0 overflow-hidden rounded-lg border border-line">
                <OutputBanner r={current.execution} />
                <div className="scrollbar-thin max-h-[440px] overflow-y-auto bg-surface px-4 py-3">
                  {current.execution.outputText ? <Markdown text={current.execution.outputText} /> : <span className="text-sm text-fg-3">No output.</span>}
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <SectionLabel className="mb-1.5">Why it was held</SectionLabel>
                  <ul className="space-y-1.5">
                    {current.approval.reasons.map((r) => (
                      <li key={r.code} className="flex gap-2 text-xs text-fg-2">
                        <CircleAlert className="mt-px size-3.5 shrink-0 text-warn-fg" />
                        {r.message}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <SectionLabel className="mb-1">Execution</SectionLabel>
                  <KeyValue label="Model">{current.execution.decision.candidates.find((c) => c.modelId === current.execution.executedModelId)?.shortName ?? "—"}</KeyValue>
                  <KeyValue label="Evaluation estimate">{current.execution.evalScore ?? "—"}/100</KeyValue>
                  <KeyValue label="Latency">{formatMs(current.execution.latencyMs)}</KeyValue>
                  <KeyValue label="External API cost">{formatUsd(current.execution.externalCostUsd)}</KeyValue>
                </div>
                {current.approval.status === "pending" ? (
                  <ApprovalActions approvalId={current.approval.id} />
                ) : (
                  <div className="rounded-md border border-line bg-surface-2 px-3 py-2 text-xs text-fg-2">
                    <div className="font-medium text-fg">
                      {current.approval.status === "approved" ? "Approved" : "Rejected"} by {current.approval.reviewer}
                    </div>
                    <div className="mt-0.5">{current.approval.note ?? "No note"}</div>
                  </div>
                )}
              </div>
            </div>
          </Panel>
        </div>
      ) : (
        <Panel>
          <Empty title="Nothing to review yet">Run a confidential scenario from Route a task to see the approval flow.</Empty>
        </Panel>
      )}
    </div>
  );
}

type Entry = Awaited<ReturnType<typeof approvalsData>>["pending"][number];

function Item({ x, active }: { x: Entry; active: boolean }) {
  return (
    <li>
      <Link href={`/approvals?id=${x.approval.id}`} className={cn("block px-4 py-2.5 transition-colors", active ? "bg-surface-3" : "hover:bg-surface-2")}>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-fg">{x.execution.title}</span>
          <span className="shrink-0 text-2xs text-fg-4">{relativeTime(x.approval.createdAt)}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <ClassificationBadge value={x.execution.classification} size="xs" />
          <span className="truncate text-xs text-fg-3">{x.approval.reasons[0]?.message}</span>
        </div>
      </Link>
    </li>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "border-warn/35 bg-warn-soft text-warn-fg",
    approved: "border-ok/30 bg-ok/10 text-ok-fg",
    rejected: "border-danger/35 bg-danger-soft text-danger-fg",
  };
  return <span className={cn("rounded-md border px-2 py-0.5 text-xs font-medium capitalize", map[status])}>{status}</span>;
}
