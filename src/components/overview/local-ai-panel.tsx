"use client";

import { Cpu, HardDrive, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useDeployment } from "@/components/shell/deployment-context";
import { StatusDot } from "@/components/ui/badges";
import { KeyValue, Panel, PanelHeader, Skeleton } from "@/components/ui/primitives";
import { useStatus } from "@/components/shell/status-context";
import { cn, formatContext, formatMs, relativeTime } from "@/lib/format";

export function LocalAiPanel() {
  const { status } = useStatus();
  const { portfolio } = useDeployment();
  return (
    <Panel className="flex flex-col">
      <PanelHeader
        title="Local AI"
        description={portfolio ? "Developer's setup · simulated in this demo" : "Ollama on this device"}
        icon={<HardDrive className="size-4" />}
      />
      {!status ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <LocalBody />
      )}
    </Panel>
  );
}

function LocalBody() {
  const { status } = useStatus();
  const { portfolio } = useDeployment();
  if (!status) return null;
  const online = status.ollama.status === "online";
  const simulated = status.ollama.status === "simulated";
  const primary = status.localModels.find((m) => m.id === status.primaryLocalId);
  return (
    <div className="flex flex-1 flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[17px] font-semibold tracking-[-0.01em] text-fg">{primary?.displayName ?? "No local model registered"}</div>
          <div className="mt-0.5 truncate font-mono text-xs text-fg-3">
            {primary?.providerModelId ?? "ollama pull <model>"} {primary?.quantization ? `· ${primary.quantization}` : ""}
          </div>
        </div>
        {simulated ? (
          <span className="inline-flex h-6 shrink-0 items-center rounded-md border border-line bg-surface-2 px-2 text-xs font-medium text-fg-2">Simulated</span>
        ) : (
          <span
            className={cn(
              "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium",
              online ? "border-ok/30 bg-ok/10 text-ok-fg" : "border-danger/35 bg-danger-soft text-danger-fg",
            )}
          >
            <StatusDot status={online ? "online" : "offline"} pulse />
            {online ? "Online" : "Offline"}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Privacy" value="Local" icon={<ShieldCheck className="size-3.5 text-local-fg" />} />
        <Stat label="External API cost" value="$0.00" />
        <Stat
          label="Median latency"
          value={formatMs(status.local.medianLatencyMs)}
          hint={status.local.total ? `measured · ${status.local.total} runs` : portfolio ? "measured on local installs" : "no real runs yet"}
        />
        <Stat
          label="Throughput"
          value={status.local.medianOutputTps ? `${status.local.medianOutputTps.toFixed(1)} tok/s` : primary ? `${primary.outputTokensPerSec.toFixed(1)} tok/s` : "—"}
          hint={status.local.medianOutputTps ? "measured" : portfolio ? "reference" : "configured"}
        />
      </div>

      <div className="mt-4 divide-y divide-line rounded-md border border-line">
        {status.localModels.length === 0 ? (
          <div className="px-3 py-2 text-xs text-fg-3">No local models discovered yet.</div>
        ) : (
          status.localModels.map((m) => (
            <div key={m.id} className="flex items-center gap-2 px-3 py-2 text-xs">
              <Cpu className="size-3.5 text-fg-3" />
              <span className="flex-1 truncate text-fg">{m.displayName}</span>
              <span className="text-fg-3">{formatContext(m.contextWindowTokens)} ctx</span>
              <span className={cn("w-16 text-right", m.resident && !simulated ? "text-local-fg" : "text-fg-3")}>
                {simulated ? "reference" : m.resident ? "resident" : online ? "idle" : "—"}
              </span>
            </div>
          ))
        )}
      </div>

      {portfolio ? (
        <>
          <div className="mt-3 space-y-0.5">
            <KeyValue label="Runtime">Ollama · local installs only</KeyValue>
            <KeyValue label="Recorded on">MacBook Pro · M3 Pro · 18 GB</KeyValue>
          </div>
          <p className="mt-auto pt-3 text-2xs leading-4 text-fg-3">
            This public demo never contacts Ollama. Run locally and this panel shows live model status, residency, and latency measured on your machine.
          </p>
        </>
      ) : (
        <>
          <div className="mt-3 space-y-0.5">
            <KeyValue label="Runtime">{status.ollama.version ? `Ollama ${status.ollama.version}` : "Ollama"}</KeyValue>
            <KeyValue label="Real local requests today">
              <span className="tnum">{status.local.today}</span>
            </KeyValue>
            <KeyValue label="Last local run">{status.local.lastAt ? relativeTime(status.local.lastAt) : "—"}</KeyValue>
          </div>
          <p className="mt-auto pt-3 text-2xs leading-4 text-fg-3">
            Zero API cost is not zero compute cost: local inference uses this machine&apos;s GPU, memory, power and time.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-surface-2 px-3 py-2">
      <div className="text-2xs text-fg-3">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-fg">
        {icon}
        <span className="tnum">{value}</span>
      </div>
      {hint ? <div className="text-2xs text-fg-4">{hint}</div> : null}
    </div>
  );
}
