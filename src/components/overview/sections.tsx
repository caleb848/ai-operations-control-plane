import { ArrowRight, Ban, GitBranch, Lock, ShieldAlert, Unplug, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Legend, ShareBar, StackedColumns } from "@/components/charts/charts";
import { ClassificationBadge, LocationChip, ModeBadge } from "@/components/ui/badges";
import { Empty, Panel, PanelHeader } from "@/components/ui/primitives";
import type { DailyPoint, ModelDistributionRow, OverviewMetrics } from "@/services/observability/repository";
import type { ExecutionSummary } from "@/services/observability/types";
import { cn, formatMs, formatUsd, relativeTime, shortDateTime } from "@/lib/format";

const LOCATION_SERIES = [
  { key: "local", label: "Local", color: "var(--local)" },
  { key: "cloud", label: "Cloud", color: "var(--cloud)" },
  { key: "blocked", label: "Blocked", color: "var(--blocked)" },
];

export function LocationChart({ daily, metrics }: { daily: DailyPoint[]; metrics: OverviewMetrics }) {
  const total = daily.reduce((s, d) => s + d.local + d.cloud + d.blocked, 0);
  return (
    <Panel className="flex flex-col">
      <PanelHeader title="Requests by execution location" description="Where each request actually ran, per day" actions={<Legend series={LOCATION_SERIES} />} />
      <div className="px-4 pb-3 pt-4">
        {total === 0 ? (
          <Empty title="No requests in this range">Run a scenario from Route a task to see it here.</Empty>
        ) : (
          <StackedColumns
            height={292}
            series={LOCATION_SERIES}
            data={daily.map((d) => ({
              label: d.day,
              display: new Date(`${d.day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
              values: { local: d.local, cloud: d.cloud, blocked: d.blocked },
            }))}
          />
        )}
      </div>
      <div className="mt-auto grid grid-cols-2 gap-px border-t border-line bg-line md:grid-cols-4">
        <Insight label="Kept on-device" value={metrics.local} sub="data never left this machine" dot="var(--local)" />
        <Insight label="Routed to cloud" value={metrics.cloud} sub="approved providers only" dot="var(--cloud)" />
        <Insight label="Median latency" value={`${formatMs(metrics.localMedianLatencyMs)} / ${formatMs(metrics.cloudMedianLatencyMs)}`} sub="local / cloud" />
        <Insight label="Blocked" value={metrics.blocked} sub="fail-closed, nothing sent" dot="var(--blocked)" />
      </div>
    </Panel>
  );
}

function Insight({ label, value, sub, dot }: { label: string; value: ReactNode; sub: string; dot?: string }) {
  return (
    <div className="bg-surface px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-fg-3">
        {dot ? <span className="size-1.5 rounded-full" style={{ background: dot }} /> : null}
        {label}
      </div>
      <div className="tnum mt-0.5 text-sm font-medium text-fg">{value}</div>
      <div className="truncate text-2xs text-fg-4">{sub}</div>
    </div>
  );
}

export function RoutingDistribution({ rows, metrics, baselineName }: { rows: ModelDistributionRow[]; metrics: OverviewMetrics; baselineName: string }) {
  const max = Math.max(1, ...rows.map((r) => r.requests));
  const total = rows.reduce((s, r) => s + r.requests, 0);
  return (
    <Panel className="flex flex-col">
      <PanelHeader title="Routing distribution" description="Completed requests by the model that served them" />
      {rows.length === 0 ? (
        <Empty title="Nothing routed yet" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-3">
                <th className="px-4 py-2 font-normal">Model</th>
                <th className="w-[34%] px-2 py-2 font-normal">Share</th>
                <th className="px-2 py-2 text-right font-normal">Eval</th>
                <th className="px-2 py-2 text-right font-normal">p50 latency</th>
                <th className="px-4 py-2 text-right font-normal">API cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.modelId} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: r.location === "local" ? "var(--local)" : "var(--cloud)" }} />
                      <span className="truncate text-fg">{r.modelName}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <ShareBar value={r.requests} max={max} color={r.location === "local" ? "var(--local)" : "var(--cloud)"} />
                      <span className="tnum w-14 shrink-0 text-right text-xs text-fg-2">
                        {r.requests} · {Math.round((r.requests / total) * 100)}%
                      </span>
                    </div>
                  </td>
                  <td className="tnum px-2 py-2 text-right text-fg-2">{r.avgEval != null ? Math.round(r.avgEval) : "—"}</td>
                  <td className="tnum px-2 py-2 text-right text-fg-2">{formatMs(r.medianLatencyMs)}</td>
                  <td className="tnum px-4 py-2 text-right">
                    {r.location === "local" ? (
                      <span className="text-local-fg">$0.00</span>
                    ) : (
                      <span className="text-fg-2" title={r.simulatedSpendUsd ? `${formatUsd(r.simulatedSpendUsd)} simulated` : undefined}>
                        {formatUsd(r.externalSpendUsd)}
                        {r.simulatedSpendUsd > 0 ? <span className="ml-1 text-fg-4">({formatUsd(r.simulatedSpendUsd)} sim)</span> : null}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <CostVsBaseline metrics={metrics} baselineName={baselineName} />
    </Panel>
  );
}

function CostVsBaseline({ metrics, baselineName }: { metrics: OverviewMetrics; baselineName: string }) {
  const baseline = metrics.baselineSpendUsd;
  const actual = metrics.externalSpendUsd + metrics.simulatedSpendUsd;
  const max = Math.max(baseline, actual, 1e-9);
  const delta = baseline > 0 ? (actual - baseline) / baseline : 0;
  return (
    <div className="mt-auto border-t border-line px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between text-xs">
        <span className="text-fg-2">Cost vs. sending everything to {baselineName}</span>
        <span className={cn("tnum font-medium", delta <= 0 ? "text-local-fg" : "text-warn-fg")}>
          {delta <= 0 ? "−" : "+"}
          {Math.abs(Math.round(delta * 100))}%
        </span>
      </div>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[110px_1fr_70px] items-center gap-2 text-xs">
          <span className="text-fg-3">Baseline (est.)</span>
          <div className="h-1.5 rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-fg-4" style={{ width: `${(baseline / max) * 100}%` }} />
          </div>
          <span className="tnum text-right text-fg-2">{formatUsd(baseline)}</span>
        </div>
        <div className="grid grid-cols-[110px_1fr_70px] items-center gap-2 text-xs">
          <span className="text-fg-3">This workspace</span>
          <div className="h-1.5 rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-cloud" style={{ width: `${Math.max(1, (actual / max) * 100)}%` }} />
          </div>
          <span className="tnum text-right text-fg-2">{formatUsd(actual)}</span>
        </div>
      </div>
      <p className="mt-2 text-2xs text-fg-4">
        {formatUsd(metrics.externalSpendUsd)} actual + {formatUsd(metrics.simulatedSpendUsd)} simulated. List prices; local runs count as $0 API cost.
      </p>
    </div>
  );
}

function eventOf(r: ExecutionSummary): { icon: ReactNode; text: string; tone: string } {
  if (r.status === "blocked" && r.error?.startsWith("Local execution required"))
    return { icon: <ShieldAlert className="size-3.5" />, text: "Fail-closed: local required, local provider unavailable", tone: "text-blocked-fg" };
  if (r.status === "blocked") return { icon: <Ban className="size-3.5" />, text: r.error ?? "Blocked", tone: "text-blocked-fg" };
  if (r.status === "failed") return { icon: <Unplug className="size-3.5" />, text: "All permitted models failed", tone: "text-danger-fg" };
  if (r.budgetGuard) return { icon: <Wallet className="size-3.5" />, text: `Budget Guard rerouted to ${r.executedModelName ?? "local"}`, tone: "text-warn-fg" };
  if (r.fallbackUsed) return { icon: <GitBranch className="size-3.5" />, text: `Provider failure, fallback to ${r.executedModelName}`, tone: "text-warn-fg" };
  return { icon: <Lock className="size-3.5" />, text: `${r.policyBlocks} cloud model${r.policyBlocks > 1 ? "s" : ""} blocked; ran on ${r.executedModelName ?? "local"}`, tone: "text-blocked-fg" };
}

export function GovernanceFeed({ events }: { events: ExecutionSummary[] }) {
  return (
    <Panel className="flex flex-col">
      <PanelHeader
        title="Governance events"
        description="Policy blocks, budget guard, failover"
        actions={
          <Link href="/requests" className="text-xs text-fg-3 hover:text-fg">
            View all
          </Link>
        }
      />
      {events.length === 0 ? (
        <Empty title="No governance events">Policy blocks and fallbacks will appear here.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {events.map((r) => {
            const e = eventOf(r);
            return (
              <li key={r.id}>
                <Link href={`/requests/${r.id}`} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-surface-2">
                  <span className={cn("mt-0.5", e.tone)}>{e.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">{e.text}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-3">
                      <ClassificationBadge value={r.classification} size="xs" />
                      <span className="truncate">{r.title}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-fg-4">{relativeTime(r.createdAt)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function RequestsTable({ rows, compact }: { rows: ExecutionSummary[]; compact?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-fg-3">
            <th className="px-4 py-2 font-normal">Time</th>
            <th className="px-2 py-2 font-normal">Request</th>
            <th className="px-2 py-2 font-normal">Data</th>
            <th className="px-2 py-2 font-normal">Served by</th>
            <th className="px-2 py-2 font-normal">Mode</th>
            <th className="px-2 py-2 text-right font-normal">Eval</th>
            <th className="px-2 py-2 text-right font-normal">Latency</th>
            <th className="px-2 py-2 text-right font-normal">API cost</th>
            <th className="px-4 py-2 font-normal">Review</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="group border-b border-line last:border-0 hover:bg-surface-2">
              <td className="tnum whitespace-nowrap px-4 py-2 text-xs text-fg-3">
                <Link href={`/requests/${r.id}`} className="block">
                  {shortDateTime(r.createdAt)}
                </Link>
              </td>
              <td className={cn("max-w-[320px] px-2 py-2", compact && "max-w-[260px]")}>
                <Link href={`/requests/${r.id}`} className="block truncate text-fg group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-2">
                  {r.title}
                </Link>
                {r.source === "seed" ? <span className="text-2xs text-fg-4">seeded demo workload</span> : r.scenarioId ? <span className="text-2xs text-fg-4">scenario</span> : null}
              </td>
              <td className="px-2 py-2">
                <ClassificationBadge value={r.classification} size="xs" />
              </td>
              <td className="px-2 py-2">
                {r.executedModelName ? (
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span className="size-1.5 rounded-full" style={{ background: r.location === "local" ? "var(--local)" : "var(--cloud)" }} />
                    <span className="text-fg">{r.executedModelName}</span>
                    {r.fallbackUsed ? <span className="text-2xs text-warn-fg">fallback</span> : null}
                    {r.budgetGuard ? <span className="text-2xs text-warn-fg">budget</span> : null}
                  </span>
                ) : (
                  <span className="text-fg-4">—</span>
                )}
              </td>
              <td className="px-2 py-2">
                <ModeBadge mode={r.status === "blocked" ? "blocked" : r.status === "failed" ? "failed" : r.mode} size="xs" />
              </td>
              <td className="tnum px-2 py-2 text-right text-fg-2">{r.evalScore ?? "—"}</td>
              <td className="tnum whitespace-nowrap px-2 py-2 text-right text-fg-2">
                {formatMs(r.latencyMs)}
                {r.latencySource === "estimated" ? <span className="text-fg-4">*</span> : null}
              </td>
              <td className="tnum whitespace-nowrap px-2 py-2 text-right">
                {r.status !== "completed" ? <span className="text-fg-4">—</span> : r.location === "local" ? <span className="text-local-fg">$0.00</span> : <span className="text-fg-2">{formatUsd(r.externalCostUsd)}</span>}
              </td>
              <td className="px-4 py-2 text-xs">
                <ReviewCell status={r.reviewStatus} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReviewCell({ status }: { status: ExecutionSummary["reviewStatus"] }) {
  if (status === "pending") return <span className="text-warn-fg">Pending</span>;
  if (status === "approved") return <span className="text-ok-fg">Approved</span>;
  if (status === "rejected") return <span className="text-danger-fg">Rejected</span>;
  return <span className="text-fg-4">—</span>;
}

export function RecentRequests({ rows }: { rows: ExecutionSummary[] }) {
  return (
    <Panel>
      <PanelHeader
        title="Recent requests"
        description="* latency estimated for simulated (DEMO) executions"
        actions={
          <Link href="/requests" className="inline-flex items-center gap-1 text-xs text-fg-3 hover:text-fg">
            All requests <ArrowRight className="size-3" />
          </Link>
        }
      />
      {rows.length ? <RequestsTable rows={rows} compact /> : <Empty title="No requests yet" />}
    </Panel>
  );
}

export { LocationChip };
