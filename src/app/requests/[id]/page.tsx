import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ApprovalActions } from "@/components/approvals/approval-actions";
import { RequestDetail } from "@/components/requests/request-detail";
import { SessionRecordView } from "@/components/routing/session-record-view";
import { Skeleton } from "@/components/ui/primitives";
import { loadConfig } from "@/config/env";
import { requestDetail } from "@/server/queries";

export default function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="mx-auto max-w-[1280px]">
      <Link href="/requests" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-fg-3 hover:text-fg">
        <ArrowLeft className="size-4" /> Decisions
      </Link>
      <Suspense fallback={<Skeleton className="h-[720px] w-full rounded-2xl" />}>
        <Detail params={params} />
      </Suspense>
    </div>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await requestDetail(id);
  if (!data) {
    // Public demo: history is per server instance; fall back to this visitor's own session copy.
    if (loadConfig().deployment.mode === "portfolio") return <SessionRecordView id={id} />;
    notFound();
  }
  const { record, approval } = data;
  return <RequestDetail r={record} approval={approval} approvalSlot={approval ? <ApprovalActions approvalId={approval.id} /> : null} />;
}
