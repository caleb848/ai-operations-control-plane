import type { Metadata } from "next";
import { Suspense } from "react";
import { PolicyEditor } from "@/components/governance/policy-editor";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/primitives";
import { modelsData, policyData } from "@/server/queries";

export const metadata: Metadata = { title: "Policies" };

export default function GovernancePage() {
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Governance policies"
        description="Local-first data policy. Each classification decides whether work may leave the device, which providers are approved, and when a person must review the output."
      />
      <Suspense fallback={<Skeleton className="h-[640px] w-full rounded-lg" />}>
        <Editor />
      </Suspense>
    </div>
  );
}

async function Editor() {
  const [{ policy }, { snap, config }] = await Promise.all([policyData(), modelsData()]);
  const models = snap.models.map((m) => ({ id: m.id, shortName: m.shortName, local: m.local, providerId: m.providerId, privacyEligibility: m.privacyEligibility, location: m.location }));
  return <PolicyEditor initial={policy} models={models} readOnly={!config.deployment.configurationEditable} />;
}
