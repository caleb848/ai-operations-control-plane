import type { Metadata } from "next";
import { Suspense } from "react";
import { ComparisonLab } from "@/components/compare/comparison-lab";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/primitives";
import { SCENARIOS } from "@/scenarios/scenarios";

export const metadata: Metadata = { title: "Comparison Lab" };

export default function ComparePage({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Model Comparison Lab"
        description="Run one task across local and cloud models and compare output, evaluation, latency, cost and privacy side by side. Governance still applies: blocked models are never called."
      />
      <Suspense fallback={<Skeleton className="h-[640px] w-full rounded-lg" />}>
        <Lab searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Lab({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  const { scenario } = await searchParams;
  return <ComparisonLab scenarios={SCENARIOS} initialScenarioId={scenario} />;
}
