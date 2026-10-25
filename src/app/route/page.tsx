import type { Metadata } from "next";
import { Suspense } from "react";
import { RouteConsole } from "@/components/routing/route-console";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/primitives";
import { loadConfig } from "@/config/env";
import { SCENARIOS } from "@/scenarios/scenarios";

export const metadata: Metadata = { title: "Route a request" };

export default function RoutePage({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  const portfolio = loadConfig().deployment.mode === "portfolio";
  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        size="lg"
        eyebrow="Route a request"
        title={<>Where should this AI request <span className="text-brand">run?</span></>}
        description="Every request is classified, checked against policy and weighed on capability and cost before anything runs. Then it goes to the right place, with the reason."
        note={portfolio ? "On this public site the routing is real; model execution is simulated." : undefined}
      />
      <Suspense fallback={<Skeleton className="h-[720px] w-full rounded-2xl" />}>
        <Console searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Console({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  const { scenario } = await searchParams;
  return <RouteConsole scenarios={SCENARIOS} initialScenarioId={scenario} />;
}
