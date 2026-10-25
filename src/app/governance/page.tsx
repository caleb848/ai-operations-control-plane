import type { Metadata } from "next";
import { Suspense } from "react";
import { PolicyEditor } from "@/components/governance/policy-editor";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/primitives";
import { modelsData, policyData } from "@/server/queries";

export const metadata: Metadata = { title: "Policies" };

export default function GovernancePage() {
  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        eyebrow="Governance"
        title={<>Data decides where AI is <span className="text-brand">allowed to run.</span></>}
        description="Each classification sets whether work may leave the device, which providers are approved, and when a person must review the output. When the rules can't be met, the system fails closed."
      />
      <Suspense fallback={<Skeleton className="h-[640px] w-full rounded-2xl" />}>
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
