import { BadgeCheck, Building2, GitBranch, Gauge, KeyRound, Lock, TrendingDown, UserRoundCheck, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ApprovalActions } from "@/components/approvals/approval-actions";
import { OutputBanner, recordedReplay } from "@/components/routing/execution-result";
import { ClassificationChip, DestinationBadge, ModeTag } from "@/components/ui/badges";
import { Markdown } from "@/components/ui/markdown";
import { PageHeader } from "@/components/ui/page-header";
import { Empty, KeyValue, Skeleton } from "@/components/ui/primitives";
import { approvalsData } from "@/server/queries";
import { cn, formatMs, formatUsd, relativeTime } from "@/lib/format";
import { reviewReasonLabel } from "@/lib/routing-view";

export const metadata: Metadata = { title: "Human review" };

export default function ApprovalsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        eyebrow="Human review"
        title={<>Some answers <span className="text-brand">wait for a person.</span></>}
        description="Policy holds an output before anyone uses it when the data is confidential or restricted, the business risk is high, the evaluation estimate is low, or no model met the quality bar."
      />
      <Suspense fallback={<Skeleton className="h-[640px] w-full rounded-2xl" />}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const REASON_ICON: Record<string, LucideIcon> = {
  classification: Lock,
  business_risk: Building2,
  low_evaluation: Gauge,
  threshold_miss: TrendingDown,
  fallback: GitBranch,
  cloud_permission: KeyRound,
};

const card = "card";

async function Queue({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const { pending, decided } = await approvalsData();
  const all = [...pending, ...decided];
  const current = all.find((x) => x.approval.id === id) ?? pending[0] ?? decided[0];

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <nav aria-label="Review queue" className={cn(card, "overflow-hidden")}>
        <div className="flex items-baseline justify-between gap-3 px-5 pb-3 pt-5">
          <h2 className="text-lg font-semibold text-fg">Waiting</h2>
          <span className="tnum text-sm text-review-ink">{pending.length} pending</span>
        </div>
        {pending.length === 0 ? (
          <Empty title="The queue is clear" icon={<BadgeCheck className="size-6" />}>
            Nothing is waiting for a person.
          </Empty>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {pending.map((x) => (
              <Item key={x.approval.id} x={x} active={current?.approval.id === x.approval.id} />
            ))}
          </ul>
        )}
        {decided.length ? (
          <>
            <h2 className="eyebrow border-y border-line bg-surface-2/60 px-5 py-2.5">Recently decided</h2>
            <ul className="scrollbar-thin divide-y divide-line lg:max-h-[420px] lg:overflow-y-auto max-lg:[&>li:nth-child(n+6)]:hidden" tabIndex={0} aria-label="Recently decided">
              {decided.map((x) => (
                <Item key={x.approval.id} x={x} active={current?.approval.id === x.approval.id} />
              ))}
            </ul>
          </>
        ) : null}
      </nav>

      {current ? (
        <article aria-labelledby="held-title" className={cn(card, "min-w-0 overflow-hidden", id && "max-lg:order-first")}>
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-6">
            <div className="min-w-0">
              <h2 id="held-title" className="text-xl font-semibold text-fg">
                {current.execution.title}
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ClassificationChip value={current.execution.classification} />
                {current.execution.location ? <DestinationBadge destination={current.execution.location} label={`Ran on ${current.execution.location === "local" ? "Local AI" : "Cloud AI"}`} /> : null}
                <ModeTag mode={recordedReplay(current.execution) ? "recorded" : current.execution.mode} />
                <Link href={`/requests/${current.execution.id}`} className="font-mono text-xs text-fg-3 underline-offset-4 hover:text-fg hover:underline">
                  {current.execution.id}
                </Link>
              </div>
            </div>
            <StatusPill status={current.approval.status} />
          </header>
          <div className="grid grid-cols-1 gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0 overflow-hidden rounded-xl border border-line">
              <OutputBanner r={current.execution} />
              <div className="scrollbar-thin max-h-[480px] overflow-y-auto px-5 py-4" tabIndex={0} aria-label="Held output">
                {current.execution.outputText ? <Markdown text={current.execution.outputText} /> : <span className="text-sm text-fg-3">No output.</span>}
              </div>
            </div>
            <div className="space-y-6">
              <section aria-labelledby="why-held">
                <h3 id="why-held" className="eyebrow mb-3">
                  Why it was held
                </h3>
                <ul className="space-y-2.5">
                  {current.approval.reasons.map((r) => {
                    const Icon = REASON_ICON[r.code] ?? UserRoundCheck;
                    return (
                      <li key={r.code} className="flex gap-2.5 text-sm">
                        <Icon className="mt-0.5 size-4 shrink-0 text-review-ink" aria-hidden />
                        <span>
                          <span className="font-medium text-fg">{reviewReasonLabel(r)}</span>
                          <span className="block text-fg-3">{r.message}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
              <section aria-labelledby="exec-facts" className="space-y-1">
                <h3 id="exec-facts" className="eyebrow mb-2">
                  The run
                </h3>
                <KeyValue label="Model">{current.execution.decision.candidates.find((c) => c.modelId === current.execution.executedModelId)?.displayName ?? "—"}</KeyValue>
                <KeyValue label="Evaluation estimate">{current.execution.evalScore != null ? `${current.execution.evalScore}/100` : "Not evaluated"}</KeyValue>
                <KeyValue label="Latency">{formatMs(current.execution.latencyMs)}</KeyValue>
                <KeyValue label="External API cost">{formatUsd(current.execution.externalCostUsd)}</KeyValue>
              </section>
              {current.approval.status === "pending" ? (
                <section aria-labelledby="decide-title">
                  <h3 id="decide-title" className="eyebrow mb-3">
                    Your decision
                  </h3>
                  <ApprovalActions approvalId={current.approval.id} />
                </section>
              ) : (
                <p className="rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-fg-2">
                  <span className="block font-medium text-fg">
                    {current.approval.status === "approved" ? "Approved" : "Rejected"} by {current.approval.reviewer}
                  </span>
                  {current.approval.note ?? "No note"}
                </p>
              )}
            </div>
          </div>
        </article>
      ) : (
        <div className={card}>
          <Empty title="Nothing to review yet">Run a confidential scenario to see the approval flow.</Empty>
        </div>
      )}
    </div>
  );
}

type Entry = Awaited<ReturnType<typeof approvalsData>>["pending"][number];

function Item({ x, active }: { x: Entry; active: boolean }) {
  const first = x.approval.reasons[0];
  return (
    <li>
      <Link
        href={`/approvals?id=${x.approval.id}`}
        aria-current={active ? "true" : undefined}
        className={cn("relative block px-5 py-3.5 transition-colors duration-[var(--dur-fast)]", active ? "bg-surface-2" : "hover:bg-surface-2/60")}
      >
        {active ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-review" aria-hidden /> : null}
        <span className="flex items-start justify-between gap-3">
          <span className="line-clamp-2 text-md font-medium text-fg">{x.execution.title}</span>
          <span className="shrink-0 text-sm text-fg-3">{relativeTime(x.approval.createdAt)}</span>
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <ClassificationChip value={x.execution.classification} size="xs" />
          {first ? <span className="truncate text-sm text-fg-3">{reviewReasonLabel(first)}</span> : null}
        </span>
      </Link>
    </li>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending: { cls: "border-review-line bg-review-soft text-review-ink", label: "Awaiting review" },
    approved: { cls: "border-line-strong bg-surface-2 text-fg-2", label: "Approved" },
    rejected: { cls: "border-danger-line bg-danger-soft text-danger-ink", label: "Rejected" },
  };
  const m = map[status] ?? map.pending;
  return (
    <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium", m.cls)}>
      <UserRoundCheck className="size-4" aria-hidden /> {m.label}
    </span>
  );
}
