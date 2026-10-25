"use client";

import { Check, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDeployment } from "@/components/shell/deployment-context";
import { announceChange } from "@/components/shell/status-context";
import { Button } from "@/components/ui/primitives";

/** Approve / reject a held output. The decision and note are written to the request's trace. */
export function ApprovalActions({ approvalId, compact }: { approvalId: string; compact?: boolean }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { portfolio } = useDeployment();

  const decide = async (decision: "approved" | "rejected") => {
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch(`/api/approvals/${approvalId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not record the decision");
      announceChange();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      {!compact && !portfolio ? (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={1000}
          aria-label="Reviewer note"
          placeholder="Reviewer note (recorded in the trace)"
          className="w-full rounded-lg border border-line-strong bg-surface-2 px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-3 focus:border-fg-3 focus:outline-none"
        />
      ) : null}
      <div className="flex gap-2">
        <Button variant="primary" disabled={Boolean(busy)} onClick={() => decide("approved")} className="flex-1">
          {busy === "approved" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Approve
        </Button>
        <Button variant="danger" disabled={Boolean(busy)} onClick={() => decide("rejected")} className="flex-1">
          {busy === "rejected" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />} Reject
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
