import { FlaskConical, Route } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { KpiStrip } from "@/components/overview/kpis";
import { PortfolioIntro } from "@/components/overview/portfolio-intro";
import { loadConfig } from "@/config/env";
import { LocalAiPanel } from "@/components/overview/local-ai-panel";
import { GovernanceFeed, LocationChart, RecentRequests, RoutingDistribution } from "@/components/overview/sections";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/primitives";
import { overviewData, type DataScope } from "@/server/queries";
import { cn } from "@/lib/format";

export default function OverviewPage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  return (
    <div className="mx-auto max-w-[1440px]">
      <Suspense fallback={<OverviewSkeleton />}>
        <Overview searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Overview({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const portfolio = loadConfig().deployment.mode === "portfolio";
  // The public demo has no real executions to filter to.
  const scope: DataScope = !portfolio && (await searchParams).data === "real" ? "real" : "all";
  const d = await overviewData(scope);
  return (
    <>
      <PageHeader
        title="AI Operations Overview"
        description="Hybrid routing between on-device models and cloud models, governed by data classification, cost, quality and latency."
        actions={
          <>
            {portfolio ? null : <ScopeToggle scope={scope} />}
            <span className="inline-flex h-7 items-center rounded-md border border-line bg-surface px-2.5 text-xs text-fg-2">Last 7 days</span>
            <Link href="/route" className="inline-flex h-7 items-center gap-1.5 rounded-md bg-fg px-2.5 text-xs font-medium text-bg hover:opacity-90">
              <Route className="size-3.5" /> Route a task
            </Link>
          </>
        }
      />
      {portfolio ? <PortfolioIntro /> : null}
      {scope === "all" && d.metrics.seedExecutions > 0 ? (
        <div className="hatch mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-warn/30 px-3.5 py-2 text-xs text-fg-2">
          <FlaskConical className="size-3.5 text-warn-fg" />
          <span>
            Includes <span className="tnum font-medium text-fg">{d.metrics.seedExecutions}</span> seeded demo requests: routed by the real engine, execution simulated and labeled DEMO.{" "}
            {portfolio ? (
              "Requests you run here are routed and simulated the same way."
            ) : (
              <>
                <span className="tnum font-medium text-fg">{d.metrics.realExecutions}</span> real execution{d.metrics.realExecutions === 1 ? "" : "s"} in this range.
              </>
            )}
          </span>
          {portfolio ? null : (
            <Link href="/?data=real" className="ml-auto font-medium text-fg hover:underline">
              Show real only
            </Link>
          )}
        </div>
      ) : null}

      <KpiStrip m={d.metrics} baselineName={d.baselineName} />

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <LocationChart daily={d.daily} metrics={d.metrics} />
        <LocalAiPanel />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <RoutingDistribution rows={d.distribution} metrics={d.metrics} baselineName={d.baselineName} />
        <GovernanceFeed events={d.events} />
      </div>
      <div className="mt-4">
        <RecentRequests rows={d.recent} />
      </div>
    </>
  );
}

function ScopeToggle({ scope }: { scope: DataScope }) {
  const item = (value: DataScope, label: string) => (
    <Link
      href={value === "real" ? "/?data=real" : "/"}
      className={cn("rounded-[5px] px-2 py-1 text-xs transition-colors", scope === value ? "bg-surface-3 text-fg" : "text-fg-3 hover:text-fg")}
    >
      {label}
    </Link>
  );
  return (
    <div className="inline-flex h-7 items-center gap-0.5 rounded-md border border-line bg-surface p-0.5">
      {item("all", "All data")}
      {item("real", "Real executions")}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div>
      <div className="mb-5 space-y-2">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-[420px] max-w-full" />
      </div>
      <Skeleton className="h-[104px] w-full rounded-lg" />
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-[290px] rounded-lg" />
        <Skeleton className="h-[290px] rounded-lg" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Skeleton className="h-[260px] rounded-lg" />
        <Skeleton className="h-[260px] rounded-lg" />
      </div>
    </div>
  );
}
