import { GitBranch, Unplug, Wallet } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ClassificationChip, DESTINATION_ICON } from "@/components/ui/badges";
import { LocalTime } from "@/components/ui/local-time";
import type { ExecutionSummary } from "@/services/observability/types";
import { formatMs, formatUsd } from "@/lib/format";
import { DESTINATION, routeOfRecord } from "@/lib/routing-view";

const REVIEW: Record<ExecutionSummary["reviewStatus"], { label: string; cls: string } | null> = {
  pending: { label: "Awaiting review", cls: "text-review-ink" },
  approved: { label: "Review approved", cls: "text-fg-2" },
  rejected: { label: "Review rejected", cls: "text-danger-ink" },
  not_required: null,
};

function outcomeOf(r: ExecutionSummary): string {
  const route = routeOfRecord(r);
  if (route === "blocked") return r.error?.startsWith("Local execution required") ? "Failed closed: local required, none available" : "Blocked by policy";
  if (route === "failed") return "Every permitted model failed";
  return `${DESTINATION[route].label} · ${r.executedModelName ?? "unknown model"}`;
}

function CostCell({ r }: { r: ExecutionSummary }) {
  if (r.status !== "completed") return <span className="text-fg-3">No cost</span>;
  if (r.location === "local") return <span className="text-fg-2">$0 API</span>;
  if (r.mode === "demo")
    return (
      <span className="text-fg-2">
        {formatUsd(r.simulatedCostUsd)} <span className="text-fg-3">sim</span>
      </span>
    );
  return <span className="text-fg-2">{formatUsd(r.externalCostUsd)}</span>;
}

/** One routing decision per row: where it went, what happened on the way, what it cost. */
export function DecisionList({ rows, showSource }: { rows: ExecutionSummary[]; showSource?: boolean }) {
  return (
    <ul className="@container divide-y divide-line">
      {rows.map((r) => {
        const route = routeOfRecord(r);
        const dest = route === "failed" ? null : route;
        const Icon = dest ? DESTINATION_ICON[dest] : Unplug;
        const review = REVIEW[r.reviewStatus];
        return (
          <li key={r.id}>
            <Link
              href={`/requests/${r.id}`}
              className="group grid grid-cols-[40px_minmax(0,1fr)] gap-x-4 px-5 py-4 transition-colors duration-[var(--dur-fast)] hover:bg-surface-2/70 sm:px-6 @3xl:grid-cols-[40px_minmax(0,1fr)_9rem_9rem] @3xl:items-center @3xl:gap-x-6"
            >
              <span
                className="icon-tile row-span-2 size-10 @3xl:row-span-1"
                style={{ "--tone": `var(--${dest ?? "danger"})`, "--tone-ink": `var(--${dest ?? "danger"}-ink)` } as CSSProperties}
              >
                <Icon className="size-[18px]" strokeWidth={1.9} aria-label={dest ? DESTINATION[dest].label : "Failed"} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-md font-medium text-fg group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4">{r.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sm text-fg-3">
                  <span className="text-fg-2">{outcomeOf(r)}</span>
                  {r.fallbackUsed ? (
                    <span className="inline-flex items-center gap-1 text-review-ink">
                      <GitBranch className="size-3.5" aria-hidden /> Fallback
                    </span>
                  ) : null}
                  {r.budgetGuard ? (
                    <span className="inline-flex items-center gap-1 text-review-ink">
                      <Wallet className="size-3.5" aria-hidden /> Budget Guard
                    </span>
                  ) : null}
                  {review ? <span className={review.cls}>{review.label}</span> : null}
                  {showSource && r.source === "seed" ? <span>Seeded demo</span> : null}
                </span>
              </span>
              <span className="col-start-2 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm @3xl:col-start-3 @3xl:mt-0">
                <ClassificationChip value={r.classification} />
                <span className="tnum text-fg-3 @3xl:hidden">
                  <CostCell r={r} /> · {formatMs(r.latencyMs)}
                </span>
              </span>
              <span className="tnum hidden text-right text-sm @3xl:block">
                <span className="block">
                  <CostCell r={r} />
                </span>
                <span className="block text-fg-3">
                  <LocalTime iso={r.createdAt} />
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
