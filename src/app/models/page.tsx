import type { Metadata } from "next";
import { Suspense } from "react";
import { CapabilityProfiles, CloudModels, LocalModels, ModelCards } from "@/components/models/registry";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/primitives";
import { modelsData } from "@/server/queries";

export const metadata: Metadata = { title: "Model registry" };

export default function ModelsPage() {
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow="Models"
        title={<>The models the router <span className="text-brand">can choose from.</span></>}
        description="Local models are discovered from Ollama; cloud models come from the configured catalog. Every model sits behind the same provider interface, and capability profiles are configuration, not benchmarks."
      />
      <Suspense fallback={<Skeleton className="h-[720px] w-full rounded-2xl" />}>
        <Registry />
      </Suspense>
    </div>
  );
}

async function Registry() {
  const { snap, overrides, config } = await modelsData();
  const local = snap.models.filter((m) => m.local);
  const cloud = snap.models.filter((m) => !m.local);
  return (
    <div className="space-y-6">
      <ModelCards models={snap.models} availability={snap.availability} />
      <CapabilityProfiles models={snap.models} overrides={overrides} readOnly={!config.deployment.configurationEditable} />
      <LocalModels models={local} availability={snap.availability} ollama={snap.ollama} readOnly={!config.deployment.configurationEditable} />
      <CloudModels models={cloud} availability={snap.availability} providers={config.providers} readOnly={!config.deployment.configurationEditable} />
    </div>
  );
}
