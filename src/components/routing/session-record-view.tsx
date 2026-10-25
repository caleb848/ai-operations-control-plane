"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { RequestDetail } from "@/components/requests/request-detail";
import type { ExecutionRecord } from "@/services/observability/types";

const noop = () => () => {};

/**
 * Public demo only: shows a request this visitor ran when the server instance
 * answering now doesn't hold it (history is in memory per instance).
 */
export function SessionRecordView({ id }: { id: string }) {
  const raw = useSyncExternalStore(
    noop,
    () => {
      try {
        return sessionStorage.getItem(`aiops:exec:${id}`);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const record = useMemo(() => (raw ? (JSON.parse(raw) as ExecutionRecord) : null), [raw]);

  if (!record) {
    return (
      <div className="card p-6 text-md text-fg-2">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 size-5 shrink-0 text-fg-3" aria-hidden />
          <p>
            This request isn&apos;t available here. The public demo keeps history in memory on each server instance, so request details can expire.{" "}
            <Link href="/route" className="font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg-3">
              Run a scenario again
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }
  return <RequestDetail r={record} sessionCopy />;
}
