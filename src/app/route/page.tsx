import type { Metadata } from "next";
import { Suspense } from "react";
import { RouteConsole } from "@/components/routing/route-console";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/primitives";
import { loadConfig } from "@/config/env";
import { SCENARIOS } from "@/scenarios/scenarios";

export const metadata: Metadata = { title: "Route a task" };

export default function RoutePage({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  const portfolio = loadConfig().deployment.mode === "portfolio";
  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Route a task"
        description={`Every request is classified, checked against policy and scored across local and cloud models before anything runs. ${
          portfolio ? "In this public demo, execution is simulated." : "Local models execute for real on this device."
        }`}
      />
      <Suspense fallback={<Skeleton className="h-[720px] w-full rounded-lg" />}>
        <Console searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Console({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  const { scenario } = await searchParams;
  return <RouteConsole scenarios={SCENARIOS} initialScenarioId={scenario} />;
}
