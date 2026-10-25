"use client";

import { Cpu, Laptop } from "lucide-react";
import type { CSSProperties } from "react";
import { useDeployment } from "@/components/shell/deployment-context";
import { useStatus } from "@/components/shell/status-context";
import { StatusDot } from "@/components/ui/badges";
import { KeyValue, Skeleton } from "@/components/ui/primitives";
import { cn, formatContext, formatMs, relativeTime } from "@/lib/format";

/** A small processor glyph with a lit core: the model running on-device. */
function Chip() {
  return (
    <svg width="58" height="58" viewBox="0 0 58 58" aria-hidden className="shrink-0">
      {[14, 22, 30, 38, 46].map((p) => (
        <g key={p} stroke="var(--line-strong)" strokeWidth="2" strokeLinecap="round">
          <path d={`M ${p} 4 V 10`} />
          <path d={`M ${p} 48 V 54`} />
          <path d={`M 4 ${p} H 10`} />
          <path d={`M 48 ${p} H 54`} />
        </g>
      ))}
      <rect x="10" y="10" width="38" height="38" rx="10" fill="var(--surface-2)" stroke="var(--local-line)" strokeWidth="1.5" />
      <rect x="19" y="19" width="20" height="20" rx="6" fill="var(--local)" style={{ filter: "drop-shadow(0 0 10px var(--local))" }} />
      <path d="M24 29 h10 M29 24 v10" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** The on-device side of the system: which model is loaded, how fast it runs, what it costs. */
export function LocalAiPanel() {
  const { status } = useStatus();
  const { portfolio } = useDeployment();
  return (
    <section
      aria-labelledby="local-title"
      className="card card-glow enter flex flex-col overflow-hidden p-6"
      style={{ "--glow": "var(--local)", "--tone": "var(--local)", "--tone-ink": "var(--local-ink)", "--i": 11 } as CSSProperties}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-local/20 blur-3xl" aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="icon-tile size-11">
            <Laptop className="size-5" strokeWidth={1.8} aria-hidden />
          </span>
          <div>
            <h2 id="local-title" className="text-xl font-semibold text-fg">
              Local AI
            </h2>
            <p className="text-sm text-fg-3">{portfolio ? "The developer's setup. Simulated on this site." : "Ollama on this device."}</p>
          </div>
        </div>
        <Chip />
      </div>
      {status ? <Body /> : <Skeleton className="mt-5 h-56 w-full rounded-xl" />}
    </section>
  );
}

function Body() {
  const { status } = useStatus();
  const { portfolio } = useDeployment();
  if (!status) return null;
  const online = status.ollama.status === "online";
  const simulated = status.ollama.status === "simulated";
  const primary = status.localModels.find((m) => m.id === status.primaryLocalId);
  const tps = status.local.medianOutputTps ?? primary?.outputTokensPerSec ?? null;
  return (
    <div className="relative mt-6 flex flex-1 flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold text-fg">{primary?.displayName ?? "No local model registered"}</div>
          <div className="truncate font-mono text-xs text-fg-3">
            {primary?.providerModelId ?? "ollama pull <model>"}
            {primary?.quantization ? ` · ${primary.quantization}` : ""}
          </div>
        </div>
        {simulated ? (
          <span className="inline-flex h-6 shrink-0 items-center rounded-md border border-line-strong bg-surface-2 px-2 text-xs font-medium text-fg-2">Simulated</span>
        ) : (
          <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium", online ? "border-local-line bg-local-soft text-local-ink" : "border-danger-line bg-danger-soft text-danger-ink")}>
            <StatusDot status={online ? "online" : "offline"} pulse={online} />
            {online ? "Online" : "Offline"}
          </span>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-y border-line py-4">
        <div>
          <dt className="eyebrow">API cost</dt>
          <dd className="tnum mt-1 text-lg font-semibold text-fg">$0.00</dd>
          <dd className="text-sm text-fg-3">compute still applies</dd>
        </div>
        <div>
          <dt className="eyebrow">Throughput</dt>
          <dd className="tnum mt-1 text-lg font-semibold text-fg">{tps ? `${tps.toFixed(1)} tok/s` : "—"}</dd>
          <dd className="text-sm text-fg-3">{status.local.medianOutputTps ? "measured" : portfolio ? "reference" : "configured"}</dd>
        </div>
        <div>
          <dt className="eyebrow">Median latency</dt>
          <dd className="tnum mt-1 text-lg font-semibold text-fg">{formatMs(status.local.medianLatencyMs)}</dd>
          <dd className="text-sm text-fg-3">{status.local.total ? `${status.local.total} measured runs` : portfolio ? "measured on local installs" : "no real runs yet"}</dd>
        </div>
        <div>
          <dt className="eyebrow">Data</dt>
          <dd className="mt-1 text-lg font-semibold text-fg">Stays local</dd>
          <dd className="text-sm text-fg-3">never leaves the device</dd>
        </div>
      </dl>

      <ul className="mt-4 space-y-2">
        {status.localModels.length === 0 ? (
          <li className="text-sm text-fg-3">No local models discovered yet.</li>
        ) : (
          status.localModels.map((m) => (
            <li key={m.id} className="flex items-center gap-2.5 text-sm">
              <Cpu className="size-4 text-fg-3" aria-hidden />
              <span className="flex-1 truncate text-fg">{m.displayName}</span>
              <span className="tnum text-fg-3">{formatContext(m.contextWindowTokens)} ctx</span>
              <span className={cn("w-16 text-right", m.resident && !simulated ? "text-local-ink" : "text-fg-3")}>
                {simulated ? "reference" : m.resident ? "resident" : online ? "idle" : "—"}
              </span>
            </li>
          ))
        )}
      </ul>

      <div className="mt-4 space-y-1 border-t border-line pt-4">
        {portfolio ? (
          <>
            <KeyValue label="Runtime">Ollama, on local installs only</KeyValue>
            <KeyValue label="Recorded on">MacBook Pro · M3 Pro · 18 GB</KeyValue>
          </>
        ) : (
          <>
            <KeyValue label="Runtime">{status.ollama.version ? `Ollama ${status.ollama.version}` : "Ollama"}</KeyValue>
            <KeyValue label="Real local runs today">
              <span className="tnum">{status.local.today}</span>
            </KeyValue>
            <KeyValue label="Last local run">{status.local.lastAt ? relativeTime(status.local.lastAt) : "—"}</KeyValue>
          </>
        )}
      </div>
      <p className="mt-auto pt-4 text-sm text-fg-3">
        {portfolio
          ? "This public site never contacts Ollama. Installed locally, this panel shows live model status and latency measured on your machine."
          : "Zero API cost is not zero compute cost: local inference uses this machine's GPU, memory, power and time."}
      </p>
    </div>
  );
}
