import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { LocalAiPanel } from "@/components/overview/local-ai-panel";
import { DestinationTiles, EconomicsCard, GovernanceTiles, HeroCard, Leaderboard, OrbitCard, SectionCard, TrafficCard } from "@/components/overview/story";
import { DecisionList } from "@/components/requests/decision-list";
import { ScenarioStories } from "@/components/routing/scenario-stories";
import { Empty, Skeleton } from "@/components/ui/primitives";
import { loadConfig } from "@/config/env";
import { SCENARIOS } from "@/scenarios/scenarios";
import { overviewData, type DataScope } from "@/server/queries";
import { cn, formatCount, formatUsd } from "@/lib/format";

export default function OverviewPage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  return (
    <div className="mx-auto max-w-[1400px]">
      <Suspense fallback={<OverviewSkeleton />}>
        <Overview searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${formatCount(n)} ${n === 1 ? one : many}`;

async function Overview({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const portfolio = loadConfig().deployment.mode === "portfolio";
  // The public demo has no real executions to filter to.
  const scope: DataScope = !portfolio && (await searchParams).data === "real" ? "real" : "all";
  const d = await overviewData(scope);
  const m = d.metrics;
  const stopped = m.blocked + m.failed;
  const story = m.total
    ? `${plural(m.total, "request")} this week. ${formatCount(m.local)} stayed on-device, ${formatCount(m.cloud)} went to approved cloud models and ${formatCount(stopped)} ${stopped === 1 ? "was" : "were"} stopped by policy. ${plural(m.reviewsRequired, "output")} ${m.reviewsRequired === 1 ? "was" : "were"} held for a person.`
    : "No requests in the last 7 days. Route one to see the decision, the reasons and the cost.";
  const actual = m.externalSpendUsd + m.simulatedSpendUsd;
  const saved = m.baselineSpendUsd > 0 ? Math.max(0, Math.round((1 - actual / m.baselineSpendUsd) * 100)) : 0;
  const seedNote =
    scope === "all" && m.seedExecutions > 0
      ? `Includes ${plural(m.seedExecutions, "seeded demo request")}: routed by the real engine, with simulated execution.${portfolio ? "" : ` ${plural(m.realExecutions, "real execution")} in this range.`}`
      : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="flex xl:col-span-7">
          <HeroCard
            story={story}
            seedNote={seedNote}
            portfolio={portfolio}
            action={portfolio ? null : <ScopeToggle scope={scope} />}
            stats={[
              { value: `${saved}%`, label: "lower API spend" },
              { value: formatCount(m.policyBlockedRequests), label: "kept off the cloud" },
              { value: formatUsd(m.externalSpendUsd), label: "paid API spend" },
            ]}
          />
        </div>
        <div className="flex xl:col-span-5 [&>section]:w-full">
          <OrbitCard m={m} />
        </div>
      </div>

      <DestinationTiles m={m} daily={d.daily} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <TrafficCard daily={d.daily} m={m} />
        </div>
        <div className="flex xl:col-span-4 [&>section]:w-full">
          <EconomicsCard m={m} baselineName={d.baselineName} portfolio={portfolio} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <GovernanceTiles m={m} />
        </div>
        <div className="xl:col-span-5">
          <Leaderboard rows={d.distribution} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <SectionCard
          id="recent-title"
          title="Recent decisions"
          sub="Where each request went, and what it cost"
          i={10}
          className="xl:col-span-8"
          action={
            <Link href="/requests" className="inline-flex items-center gap-1 text-sm font-medium text-brand-ink hover:underline">
              All decisions <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          {d.recent.length ? <DecisionList rows={d.recent.slice(0, 6)} showSource={!portfolio} /> : <Empty title="No requests yet">Route a request to see it here.</Empty>}
        </SectionCard>
        <div className="flex xl:col-span-4 [&>section]:w-full">
          <LocalAiPanel />
        </div>
      </div>

      <SectionCard id="scenarios-title" title="See it decide" sub="Six situations, one routing engine. Each runs the real engine and policy." i={11}>
        <div className="px-6 pb-6">
          <ScenarioStories scenarios={SCENARIOS} className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" />
        </div>
      </SectionCard>
    </div>
  );
}

function ScopeToggle({ scope }: { scope: DataScope }) {
  const item = (value: DataScope, label: string) => (
    <Link
      href={value === "real" ? "/?data=real" : "/"}
      aria-current={scope === value ? "page" : undefined}
      className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors", scope === value ? "bg-white text-[#24178f]" : "text-white hover:bg-white/10")}
    >
      {label}
    </Link>
  );
  // Sits on the hero's lit corner, so it carries its own dark glass for contrast.
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-white/15 bg-[#1d1567]/60 p-1 backdrop-blur-sm" role="group" aria-label="Data scope">
      {item("all", "All data")}
      {item("real", "Real only")}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Skeleton className="h-[440px] rounded-3xl xl:col-span-7" />
        <Skeleton className="h-[440px] rounded-3xl xl:col-span-5" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[210px] rounded-3xl" />
        ))}
      </div>
    </div>
  );
}
