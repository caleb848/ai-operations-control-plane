"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { Panel, PanelHeader } from "@/components/ui/primitives";
import type { ExecutionRecord } from "@/services/observability/types";
import { DecisionPanel } from "./decision-panel";
import { ExecutionResult } from "./execution-result";

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
      <Panel className="p-6 text-sm text-fg-2">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-fg-3" />
          <div>
            This request isn&apos;t available here. The public demo keeps history in memory on each server instance, so details of a request can expire.{" "}
            <Link href="/route" className="font-medium text-fg underline underline-offset-2">
              Run a scenario again
            </Link>
            .
          </div>
        </div>
      </Panel>
    );
  }
  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel>
        <PanelHeader title={record.title} description="From this browser session · public demo" />
        <div className="p-4">
          <ExecutionResult r={record} />
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Routing decision" description="Snapshot taken at request time" />
        <div className="p-4">
          <DecisionPanel decision={record.decision} compact />
        </div>
      </Panel>
    </div>
  );
}
