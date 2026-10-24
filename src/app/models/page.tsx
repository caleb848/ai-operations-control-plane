import type { Metadata } from "next";
import { Suspense } from "react";
import { CapabilityProfiles, CloudModels, LocalModels } from "@/components/models/registry";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/primitives";
import { modelsData } from "@/server/queries";

export const metadata: Metadata = { title: "Model registry" };

export default function ModelsPage() {
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Model registry"
        description="Local models are discovered from Ollama; cloud models come from the configured catalog. Every model sits behind the same provider interface."
      />
      <Suspense fallback={<Skeleton className="h-[720px] w-full rounded-lg" />}>
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
    <div className="space-y-4">
      <LocalModels models={local} availability={snap.availability} ollama={snap.ollama} readOnly={!config.deployment.configurationEditable} />
      <CloudModels models={cloud} availability={snap.availability} providers={config.providers} readOnly={!config.deployment.configurationEditable} />
      <CapabilityProfiles models={snap.models} overrides={overrides} readOnly={!config.deployment.configurationEditable} />
    </div>
  );
}
