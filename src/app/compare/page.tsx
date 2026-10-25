import type { Metadata } from "next";
import { Suspense } from "react";
import { ComparisonLab } from "@/components/compare/comparison-lab";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/primitives";
import { loadConfig } from "@/config/env";
import { SCENARIOS } from "@/scenarios/scenarios";

export const metadata: Metadata = { title: "Compare models" };

export default function ComparePage({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  const portfolio = loadConfig().deployment.mode === "portfolio";
  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        eyebrow="Compare models"
        title={<>Which model is <span className="text-brand">worth it</span> for this task?</>}
        description="Put local and cloud models side by side on quality, cost, speed and privacy. Governance still applies: a blocked model is never called."
        note={portfolio ? "On this public site the comparison is simulated: no model is called." : undefined}
      />
      <Suspense fallback={<Skeleton className="h-[640px] w-full rounded-2xl" />}>
        <Lab searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Lab({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  const { scenario } = await searchParams;
  return <ComparisonLab scenarios={SCENARIOS} initialScenarioId={scenario} />;
}
