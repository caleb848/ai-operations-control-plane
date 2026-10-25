"use client";

import { Cloud, Gauge, HardDrive, Info, Pencil, RotateCcw, Save, Terminal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ModelAvailability } from "@/core/routing/engine";
import type { CapabilityProfile, ModelDescriptor } from "@/core/types";
import { StatusDot } from "@/components/ui/badges";
import { Radar } from "@/components/charts/viz";
import { Button, Tip } from "@/components/ui/primitives";
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
      className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors duration-[var(--dur-fast)]", on ? "bg-fg" : "bg-surface-3 ring-1 ring-inset ring-line-strong")}
    >
      <span className={cn("absolute top-[3px] size-[18px] rounded-full shadow transition-[left] duration-[var(--dur)] ease-[var(--ease-out)]", on ? "left-[19px] bg-bg" : "left-[3px] bg-fg-3")} />
    </button>
  );
}

function SectionCard({ title, description, icon, actions, children, footer }: { title: string; description: string; icon: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pb-4 pt-6 sm:px-6">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-fg">
            <span className="text-fg-3">{icon}</span>
            {title}
          </h2>
          <p className="mt-1 text-sm text-fg-3">{description}</p>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <div className="border-t border-line">{children}</div>
      {footer ? <div className="border-t border-line px-5 py-3.5 text-sm text-fg-3 sm:px-6">{footer}</div> : null}
    </section>
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
    <SectionCard
      title={simulated ? "Local models (reference)" : "Local models"}
      description={simulated ? "As installed on the developer's Mac. Execution is simulated on this site." : `Discovered from Ollama at ${ollama.baseUrl} and registered automatically.`}
      icon={<HardDrive className="size-5" />}
      actions={
        simulated ? (
          <span className="inline-flex h-7 items-center rounded-md border border-line-strong bg-surface-2 px-2.5 text-sm font-medium text-fg-2">Simulated here</span>
        ) : (
          <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", online ? "text-fg" : "text-danger-ink")}>
            <StatusDot status={online ? "online" : "offline"} pulse={online} />
            {online ? `Ollama ${ollama.version ?? ""} online` : "Ollama offline"}
          </span>
        )
      }
      footer={
        simulated ? (
          <>
            A local install discovers these with <code className="rounded bg-surface-2 px-1.5 font-mono text-[13px] text-fg-2">ollama list</code> and runs them for real. Throughput figures are the
            developer&apos;s own measurements on an M3 Pro.
          </>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <Terminal className="size-4" aria-hidden /> Add a model with <code className="rounded bg-surface-2 px-1.5 font-mono text-[13px] text-fg-2">ollama pull llama3.2:3b</code> and it is
            registered on the next request with a conservative family profile. Local models cost $0 in API fees; compute, memory and power are not free.
          </span>
        )
      }
    >
      <div className="overflow-x-auto" tabIndex={0} aria-label="Local models">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-sm text-fg-3">
              <th className="px-6 py-3 font-normal">Model</th>
              <th className="px-3 py-3 font-normal">Parameters</th>
              <th className="px-3 py-3 font-normal">Size</th>
              <th className="px-3 py-3 font-normal">Context (effective / max)</th>
              <th className="px-3 py-3 font-normal">Throughput</th>
              <th className="px-3 py-3 font-normal">Status</th>
              <th className="px-6 py-3 text-right font-normal">Routable</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => {
              const a = availability[m.id];
              return (
                <tr key={m.id} className="border-b border-line last:border-0">
                  <td className="px-6 py-3.5">
                    <div className="text-md font-medium text-fg">{m.displayName}</div>
                    <div className="font-mono text-xs text-fg-3">
                      {m.providerModelId}
                      {m.details?.aliases?.length ? <span> · alias {m.details.aliases.join(", ")}</span> : null}
                    </div>
                  </td>
                  <td className="tnum px-3 py-3.5 text-fg-2">
                    {m.details?.parameterSize ?? "—"} <span className="text-fg-3">{m.details?.quantization}</span>
                  </td>
                  <td className="tnum px-3 py-3.5 text-fg-2">{gb(m.details?.sizeBytes)}</td>
                  <td className="tnum px-3 py-3.5 text-fg-2">
                    {formatContext(m.contextWindowTokens)} <span className="text-fg-3">/ {formatContext(m.maxContextTokens)}</span>
                  </td>
                  <td className="tnum px-3 py-3.5 text-fg-2">
                    {m.latency.outputTokensPerSec.toFixed(1)} tok/s <span className="text-sm text-fg-3">{m.latency.source === "measured" ? `measured, n=${m.latency.samples}` : "configured"}</span>
                  </td>
                  <td className="px-3 py-3.5">
                    <span className={a?.backend === "simulated" ? "text-fg-2" : a?.available ? (a.warm ? "text-local-ink" : "text-fg-2") : "text-danger-ink"}>
                      {a?.backend === "simulated" ? "Simulated" : a?.available ? (a.warm ? "Resident in memory" : "Idle (cold start)") : "Unavailable"}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-right">{readOnly ? <span className="text-fg-2">{m.enabled ? "Yes" : "No"}</span> : <EnabledToggle model={m} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
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
    <SectionCard title="Cloud models" description="List prices per million tokens. Capability values are routing configuration." icon={<Cloud className="size-5" />} footer={models[0]?.pricing?.source}>
      <div className="overflow-x-auto" tabIndex={0} aria-label="Cloud models">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-sm text-fg-3">
              <th className="px-6 py-3 font-normal">Model</th>
              <th className="px-3 py-3 font-normal">Tier</th>
              <th className="px-3 py-3 text-right font-normal">Input / MTok</th>
              <th className="px-3 py-3 text-right font-normal">Output / MTok</th>
              <th className="px-3 py-3 font-normal">Context</th>
              <th className="px-3 py-3 font-normal">Highest data level</th>
              <th className="px-3 py-3 font-normal">Execution</th>
              <th className="px-6 py-3 text-right font-normal">Routable</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => {
              const a = availability[m.id];
              return (
                <tr key={m.id} className="border-b border-line last:border-0">
                  <td className="px-6 py-3.5">
                    <div className="text-md font-medium text-fg">{m.displayName}</div>
                    <div className="font-mono text-xs text-fg-3">
                      {PROVIDER_NAME[m.providerId]} · {m.providerModelId}
                    </div>
                  </td>
                  <td className="px-3 py-3.5 capitalize text-fg-2">{m.tier}</td>
                  <td className="tnum px-3 py-3.5 text-right text-fg-2">{m.pricing ? `$${m.pricing.inputPerMTok.toFixed(2)}` : "—"}</td>
                  <td className="tnum px-3 py-3.5 text-right text-fg-2">{m.pricing ? `$${m.pricing.outputPerMTok.toFixed(2)}` : "—"}</td>
                  <td className="tnum px-3 py-3.5 text-fg-2">{formatContext(m.contextWindowTokens)}</td>
                  <td className="px-3 py-3.5 capitalize text-fg-2">{m.privacyEligibility}</td>
                  <td className="px-3 py-3.5">
                    {a?.backend === "simulated" ? <span className="text-fg-2">Simulated</span> : a?.available ? <span className="text-cloud-ink">Live API</span> : <span className="text-danger-ink">{a?.reason}</span>}
                  </td>
                  <td className="px-6 py-3.5 text-right">{readOnly ? <span className="text-fg-2">{m.enabled ? "Yes" : "No"}</span> : <EnabledToggle model={m} />}</td>
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
                <tr key={id} className="border-b border-line last:border-0">
                  <td className="px-6 py-3.5">
                    <div className="text-md font-medium text-fg-2">{name}</div>
                    <div className="text-sm text-fg-3">Adapter implemented, not configured</div>
                  </td>
                  <td colSpan={7} className="px-3 py-3.5 text-sm text-fg-3">
                    {readOnly ? (
                      "Available on a local install once configured. No prices are guessed."
                    ) : (
                      <>
                        Set <span className="font-mono text-[13px] text-fg-2">{vars}</span> to register it. No prices are guessed.
                      </>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
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
    <SectionCard
      title="Capability profiles"
      description="Routing configuration, not independent benchmarks. Tune them with evidence from the Comparison Lab."
      icon={<Gauge className="size-5" />}
      actions={
        <Tip content="Each value (0–100) is how much the router trusts a model for a kind of work. Task fit blends the dimensions per task type; reasoning weighs more as complexity rises.">
          <button type="button" aria-label="About capability profiles" className="-m-2 rounded-lg p-2 text-fg-3 hover:bg-surface-2 hover:text-fg">
            <Info className="size-4" />
          </button>
        </Tip>
      }
    >
      <div className="grid grid-cols-1 gap-4 p-5 sm:p-6 md:grid-cols-2 2xl:grid-cols-3">
        {models.map((m) => (
          <ProfileRow key={m.id} model={m} readOnly={readOnly} overridden={Boolean(overrides[m.id]?.capabilities && Object.keys(overrides[m.id].capabilities ?? {}).length)} />
        ))}
      </div>
    </SectionCard>
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
    <div className="spotlight relative flex flex-col overflow-hidden rounded-[22px] border border-line bg-surface-2/50 p-5" style={{ "--tone": color, "--tone-ink": model.local ? "var(--local-ink)" : "var(--cloud-ink)" } as React.CSSProperties}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-tile size-11 font-display text-lg font-bold">{model.displayName.replace(/^Claude /, "").charAt(0)}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 truncate text-md font-semibold text-fg">
              {model.displayName}
              {overridden ? <span className="rounded-full border border-brand-line bg-brand-soft px-2 text-xs font-medium text-brand-ink">Tuned</span> : null}
            </div>
            <div className="text-sm" style={{ color: model.local ? "var(--local-ink)" : "var(--cloud-ink)" }}>
              {model.local ? "Local AI" : "Cloud AI"}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-1">
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
      <div className="mt-2 flex justify-center">
        <Radar values={DIMS.map((d) => values[d])} labels={DIMS} color={color} size={232} label={`${model.displayName} capability profile: ${DIMS.map((d) => `${d} ${values[d]}`).join(", ")}`} />
      </div>
      <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-2">
        {DIMS.map((d) => (
          <li key={d} className="min-w-0">
            {editing ? (
              <label className="block">
                <span className="flex items-baseline justify-between text-xs capitalize text-fg-3">
                  {d} <span className="tnum text-fg-2">{values[d]}</span>
                </span>
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
              </label>
            ) : (
              <span className="flex items-baseline justify-between gap-2 rounded-xl border border-line bg-surface/70 px-2.5 py-1.5 text-xs">
                <span className="truncate capitalize text-fg-3">{d}</span>
                <span className="tnum font-display text-sm font-semibold text-fg">{values[d]}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-line pt-3 text-sm text-fg-3">{model.capabilityBasis}</p>
    </div>
  );
}

/** One glowing card per model: where it runs, what it costs, how much it can read. */
export function ModelCards({ models, availability }: { models: ModelDescriptor[]; availability: Record<string, ModelAvailability> }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Models">
      {models.map((m, i) => {
        const tone = m.local ? "local" : "cloud";
        const a = availability[m.id];
        const state = a?.backend === "simulated" ? "Simulated" : a?.available ? (m.local ? (a.warm ? "Resident" : "Idle") : "Live API") : "Unavailable";
        return (
          <li
            key={m.id}
            className="card card-glow spotlight enter flex flex-col overflow-hidden p-5"
            style={{ "--glow": `var(--${tone})`, "--tone": `var(--${tone})`, "--tone-ink": `var(--${tone}-ink)`, "--i": i } as React.CSSProperties}
          >
            <div className="pointer-events-none absolute -right-12 -top-12 size-32 rounded-full blur-2xl" style={{ background: `color-mix(in srgb, var(--${tone}) 24%, transparent)` }} aria-hidden />
            <div className="relative flex items-center justify-between">
              <span className="icon-tile size-12 font-display text-xl font-bold">{m.displayName.replace(/^Claude /, "").charAt(0)}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/80 px-2.5 py-1 text-xs font-medium text-fg-2">
                <span className="size-1.5 rounded-full" style={{ background: a?.available ? `var(--${tone})` : "var(--danger)", boxShadow: `0 0 8px var(--${tone})` }} aria-hidden />
                {state}
              </span>
            </div>
            <div className="relative mt-4 font-display text-xl font-semibold text-fg">{m.displayName}</div>
            <div className="relative text-sm" style={{ color: `var(--${tone}-ink)` }}>
              {m.local ? `Local AI · ${m.details?.parameterSize ?? "local"}` : `Cloud AI · ${m.tier}`}
            </div>
            <div className="relative mt-5">
              <div className="tnum font-display text-3xl font-semibold leading-none text-fg">{m.local ? "$0" : m.pricing ? `$${m.pricing.inputPerMTok.toFixed(2)}` : "—"}</div>
              <div className="mt-1 text-xs text-fg-3">{m.local ? "API cost, compute on-device" : m.pricing ? `per MTok in · $${m.pricing.outputPerMTok.toFixed(2)} out` : "no price configured"}</div>
            </div>
            <dl className="relative mt-auto grid grid-cols-2 gap-2 pt-5 text-xs">
              <div className="rounded-xl border border-line bg-surface-2/70 px-2.5 py-2">
                <dt className="text-fg-3">Context</dt>
                <dd className="tnum mt-0.5 font-display text-sm font-semibold text-fg">{formatContext(m.contextWindowTokens)}</dd>
              </div>
              <div className="rounded-xl border border-line bg-surface-2/70 px-2.5 py-2">
                <dt className="text-fg-3">{m.local ? "Throughput" : "Data up to"}</dt>
                <dd className={cn("tnum mt-0.5 truncate font-display text-sm font-semibold text-fg", !m.local && "capitalize")}>{m.local ? `${m.latency.outputTokensPerSec.toFixed(1)} tok/s` : m.privacyEligibility}</dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
