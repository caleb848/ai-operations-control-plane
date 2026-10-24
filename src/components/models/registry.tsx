"use client";

import { Cloud, HardDrive, Info, Pencil, RotateCcw, Save, Terminal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ModelAvailability } from "@/core/routing/engine";
import type { CapabilityProfile, ModelDescriptor } from "@/core/types";
import { StatusDot } from "@/components/ui/badges";
import { Button, Panel, PanelHeader, Tip } from "@/components/ui/primitives";
import { cn, formatContext, PROVIDER_NAME } from "@/lib/format";

const DIMS: (keyof CapabilityProfile)[] = ["reasoning", "extraction", "summarization", "creative", "coding", "classification"];

function gb(bytes?: number) {
  return bytes ? `${(bytes / 1e9).toFixed(1)} GB` : "—";
}

function EnabledToggle({ model }: { model: ModelDescriptor }) {
  const router = useRouter();
  const [on, setOn] = useState(model.enabled);
  const flip = async () => {
    const next = !on;
    setOn(next);
    const res = await fetch(`/api/models/${encodeURIComponent(model.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) });
    if (!res.ok) setOn(!next);
    router.refresh();
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Enable ${model.displayName}`}
      onClick={flip}
      className={cn("relative h-[18px] w-8 shrink-0 rounded-full transition-colors", on ? "bg-local" : "bg-surface-3 ring-1 ring-line-strong")}
    >
      <span className={cn("absolute top-[2px] size-[14px] rounded-full bg-white shadow transition-[left]", on ? "left-[16px]" : "left-[2px]")} />
    </button>
  );
}

export function LocalModels({
  models,
  availability,
  ollama,
  readOnly = false,
}: {
  models: ModelDescriptor[];
  availability: Record<string, ModelAvailability>;
  ollama: { status: string; version?: string; baseUrl: string; detail: string };
  readOnly?: boolean;
}) {
  const online = ollama.status === "online";
  const simulated = ollama.status === "simulated";
  return (
    <Panel>
      <PanelHeader
        title={simulated ? "Local models (reference)" : "Local models"}
        description={simulated ? "As installed on the developer's Mac · execution simulated in this demo" : `Discovered from Ollama at ${ollama.baseUrl} · registered automatically`}
        icon={<HardDrive className="size-4" />}
        actions={
          simulated ? (
            <span className="text-xs font-medium text-warn-fg">Simulated · not reachable from this site</span>
          ) : (
            <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", online ? "text-ok-fg" : "text-danger-fg")}>
              <StatusDot status={online ? "online" : "offline"} pulse />
              {online ? `Ollama ${ollama.version ?? ""} online` : "Ollama offline"}
            </span>
          )
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-3">
              <th className="px-4 py-2 font-normal">Model</th>
              <th className="px-2 py-2 font-normal">Parameters</th>
              <th className="px-2 py-2 font-normal">Size</th>
              <th className="px-2 py-2 font-normal">Context (effective / max)</th>
              <th className="px-2 py-2 font-normal">Throughput</th>
              <th className="px-2 py-2 font-normal">Status</th>
              <th className="px-4 py-2 text-right font-normal">Routable</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => {
              const a = availability[m.id];
              return (
                <tr key={m.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-fg">{m.displayName}</div>
                    <div className="font-mono text-xs text-fg-3">
                      {m.providerModelId}
                      {m.details?.aliases?.length ? <span className="text-fg-4"> · alias {m.details.aliases.join(", ")}</span> : null}
                    </div>
                  </td>
                  <td className="tnum px-2 py-3 text-fg-2">
                    {m.details?.parameterSize ?? "—"} <span className="text-fg-4">{m.details?.quantization}</span>
                  </td>
                  <td className="tnum px-2 py-3 text-fg-2">{gb(m.details?.sizeBytes)}</td>
                  <td className="tnum px-2 py-3 text-fg-2">
                    {formatContext(m.contextWindowTokens)} <span className="text-fg-4">/ {formatContext(m.maxContextTokens)}</span>
                  </td>
                  <td className="tnum px-2 py-3 text-fg-2">
                    {m.latency.outputTokensPerSec.toFixed(1)} tok/s{" "}
                    <span className={cn("text-2xs", m.latency.source === "measured" ? "text-local-fg" : "text-fg-4")}>
                      {m.latency.source === "measured" ? `measured · n=${m.latency.samples}` : "configured"}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-xs">
                    <span className={a?.available ? (a.warm ? "text-local-fg" : "text-fg-2") : "text-danger-fg"}>
                      {a?.backend === "simulated" ? "Simulated" : a?.available ? (a.warm ? "Resident in memory" : "Idle (cold start)") : "Unavailable"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{readOnly ? <span className="text-xs text-fg-3">{m.enabled ? "Yes" : "No"}</span> : <EnabledToggle model={m} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {simulated ? (
        <div className="border-t border-line px-4 py-2.5 text-xs text-fg-3">
          A local install discovers these from <code className="rounded bg-surface-2 px-1 font-mono text-fg-2">ollama list</code> and runs them for real; throughput
          figures are the developer&apos;s own measurements on an M3 Pro.
        </div>
      ) : (
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5 text-xs text-fg-3">
        <Terminal className="size-3.5" />
        Add a model with <code className="rounded bg-surface-2 px-1 font-mono text-fg-2">ollama pull llama3.2:3b</code> and it is registered on the next request with a conservative family profile.
        External API cost is $0.00 for every local model; compute, memory and power are not free.
      </div>
      )}
    </Panel>
  );
}

export function CloudModels({
  models,
  availability,
  providers,
  readOnly = false,
}: {
  models: ModelDescriptor[];
  availability: Record<string, ModelAvailability>;
  providers: { anthropic: boolean; openai: boolean; google: boolean };
  readOnly?: boolean;
}) {
  return (
    <Panel>
      <PanelHeader title="Cloud models" description="List prices per million tokens · capability values are routing configuration" icon={<Cloud className="size-4" />} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-3">
              <th className="px-4 py-2 font-normal">Model</th>
              <th className="px-2 py-2 font-normal">Tier</th>
              <th className="px-2 py-2 text-right font-normal">Input / MTok</th>
              <th className="px-2 py-2 text-right font-normal">Output / MTok</th>
              <th className="px-2 py-2 font-normal">Context</th>
              <th className="px-2 py-2 font-normal">Max data level</th>
              <th className="px-2 py-2 font-normal">Execution</th>
              <th className="px-4 py-2 text-right font-normal">Routable</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => {
              const a = availability[m.id];
              return (
                <tr key={m.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-fg">{m.displayName}</div>
                    <div className="font-mono text-xs text-fg-3">
                      {PROVIDER_NAME[m.providerId]} · {m.providerModelId}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-xs capitalize text-fg-2">{m.tier}</td>
                  <td className="tnum px-2 py-3 text-right text-fg-2">{m.pricing ? `$${m.pricing.inputPerMTok.toFixed(2)}` : "—"}</td>
                  <td className="tnum px-2 py-3 text-right text-fg-2">{m.pricing ? `$${m.pricing.outputPerMTok.toFixed(2)}` : "—"}</td>
                  <td className="tnum px-2 py-3 text-fg-2">{formatContext(m.contextWindowTokens)}</td>
                  <td className="px-2 py-3 text-xs capitalize text-fg-2">{m.privacyEligibility}</td>
                  <td className="px-2 py-3 text-xs">
                    {a?.backend === "simulated" ? <span className="text-warn-fg">DEMO · simulated</span> : a?.available ? <span className="text-cloud-fg">Live API</span> : <span className="text-danger-fg">{a?.reason}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">{readOnly ? <span className="text-xs text-fg-3">{m.enabled ? "Yes" : "No"}</span> : <EnabledToggle model={m} />}</td>
                </tr>
              );
            })}
            {(
              [
                ["openai", "OpenAI", "OPENAI_API_KEY, OPENAI_MODEL, OPENAI_INPUT_PRICE_PER_MTOK, OPENAI_OUTPUT_PRICE_PER_MTOK"],
                ["google", "Google Gemini", "GEMINI_API_KEY, GEMINI_MODEL, GEMINI_INPUT_PRICE_PER_MTOK, GEMINI_OUTPUT_PRICE_PER_MTOK"],
              ] as const
            )
              .filter(([id]) => !providers[id])
              .map(([id, name, vars]) => (
                <tr key={id} className="border-b border-line text-fg-4 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-fg-3">{name}</div>
                    <div className="text-xs">Adapter implemented · not configured</div>
                  </td>
                  <td colSpan={7} className="px-2 py-3 text-xs">
                    {readOnly ? (
                      "Available on a local installation once configured. No prices are guessed."
                    ) : (
                      <>
                        Set <span className="font-mono text-fg-3">{vars}</span> to register it. No prices are guessed.
                      </>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line px-4 py-2.5 text-xs text-fg-3">{models[0]?.pricing?.source}</div>
    </Panel>
  );
}

export function CapabilityProfiles({
  models,
  overrides,
  readOnly = false,
}: {
  models: ModelDescriptor[];
  overrides: Record<string, { capabilities?: Partial<CapabilityProfile> }>;
  readOnly?: boolean;
}) {
  return (
    <Panel>
      <PanelHeader
        title="Configurable Capability Profiles"
        description="Routing configuration, not independent benchmarks. Tune them with evidence from the Comparison Lab."
        actions={
          <Tip content="Each value (0–100) expresses how much the router trusts a model for a kind of work. Task fit blends the dimensions per task type; reasoning carries more weight as complexity rises.">
            <Info className="size-4 text-fg-3" />
          </Tip>
        }
      />
      <div className="divide-y divide-line">
        {models.map((m) => (
          <ProfileRow key={m.id} model={m} readOnly={readOnly} overridden={Boolean(overrides[m.id]?.capabilities && Object.keys(overrides[m.id].capabilities ?? {}).length)} />
        ))}
      </div>
    </Panel>
  );
}

function ProfileRow({ model, overridden, readOnly }: { model: ModelDescriptor; overridden: boolean; readOnly: boolean }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<CapabilityProfile>(model.capabilities);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const color = model.local ? "var(--local)" : "var(--cloud)";

  const save = async () => {
    setBusy(true);
    await fetch(`/api/models/${encodeURIComponent(model.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ capabilities: values }) });
    setBusy(false);
    setEditing(false);
    router.refresh();
  };
  const reset = async () => {
    setBusy(true);
    await fetch(`/api/models/${encodeURIComponent(model.id)}`, { method: "DELETE" });
    setBusy(false);
    setEditing(false);
    router.refresh();
  };

  return (
    <div className="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium text-fg">
          <span className="size-1.5 rounded-full" style={{ background: color }} />
          {model.displayName}
          {overridden ? <span className="rounded bg-warn-soft px-1 text-2xs text-warn-fg">tuned</span> : null}
        </div>
        <p className="mt-1 text-2xs leading-4 text-fg-3">{model.capabilityBasis}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
        {DIMS.map((d) => (
          <div key={d} className="grid grid-cols-[86px_1fr_28px] items-center gap-2">
            <span className="text-xs capitalize text-fg-3">{d}</span>
            {editing ? (
              <input
                type="range"
                min={0}
                max={100}
                value={values[d]}
                onChange={(e) => setValues((v) => ({ ...v, [d]: Number(e.target.value) }))}
                className="w-full"
                style={{ accentColor: color }}
                aria-label={`${model.displayName} ${d}`}
              />
            ) : (
              <div className="h-1.5 rounded-full bg-surface-3">
                <div className="h-full rounded-full" style={{ width: `${values[d]}%`, background: color }} />
              </div>
            )}
            <span className="tnum text-right text-xs text-fg-2">{values[d]}</span>
          </div>
        ))}
      </div>
      <div className="flex items-start gap-1.5">
        {readOnly ? null : editing ? (
          <>
            <Button size="sm" variant="primary" disabled={busy} onClick={save}>
              <Save className="size-3.5" /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => (setValues(model.capabilities), setEditing(false))}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" /> Tune
            </Button>
            {overridden ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={reset}>
                <RotateCcw className="size-3.5" /> Default
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
