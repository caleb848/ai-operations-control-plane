"use client";

import { CornerDownLeft, FileText, FlaskConical, Laptop, Lightbulb, Loader2, Pencil, Play, Radio, RotateCcw, Route as RouteGlyph, ShieldBan, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PRIORITY_DESCRIPTION, PRIORITY_LABEL } from "@/core/routing/config";
import { estimateTokens } from "@/core/pricing/tokens";
import type { DataClassification, PriorityMode, RoutingDecision, SimulationOptions, TraceEvent } from "@/core/types";
import type { Scenario } from "@/scenarios/scenarios";
import type { ExecutionRecord } from "@/services/observability/types";
import { useDeployment } from "@/components/shell/deployment-context";
import { announceChange, useStatus } from "@/components/shell/status-context";
import { Disclosure } from "@/components/ui/disclosure";
import { Button, Skeleton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { rememberRecord } from "@/lib/session-records";
import { cn, formatMs, formatUsd } from "@/lib/format";
import { CLASSIFICATION_META, SCENARIO_STORY } from "@/lib/routing-view";
import { DecisionDetails, OutcomeCard, WhyList } from "./decision-panel";
import { ExecutionResult } from "./execution-result";
import { RouteFlow } from "./route-flow";
import { ScenarioStories } from "./scenario-stories";

interface PlanResponse {
  decision: RoutingDecision;
  trace: TraceEvent[];
  cloudLive: boolean;
}

const PRIORITIES: PriorityMode[] = ["balanced", "lowest_cost", "best_quality", "fastest", "privacy_first"];
const SHORT: Record<PriorityMode, string> = { lowest_cost: "Cost", balanced: "Balanced", best_quality: "Quality", fastest: "Speed", privacy_first: "Privacy" };

export function RouteConsole({ scenarios, initialScenarioId }: { scenarios: Scenario[]; initialScenarioId?: string }) {
  const first = scenarios.find((s) => s.id === initialScenarioId) ?? scenarios[0];
  const [scenarioId, setScenarioId] = useState<string | null>(first.id);
  const [instruction, setInstruction] = useState(first.instruction);
  const [context, setContext] = useState(first.context);
  const [declared, setDeclared] = useState<DataClassification | "auto">(first.declaredClassification ?? "auto");
  const [priority, setPriority] = useState<PriorityMode>(first.priorityMode);
  const [sim, setSim] = useState<SimulationOptions>(first.simulation ?? {});
  const [permission, setPermission] = useState({ granted: false, justification: "" });
  const [editing, setEditing] = useState(false);

  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [run, setRun] = useState<{ state: "idle" | "running" | "done" | "error"; startedAt?: number; record?: ExecutionRecord; error?: string }>({ state: "idle" });
  // A paid-call confirmation belongs to the exact request it was given for; editing anything clears it.
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);
  const { status } = useStatus();
  const { portfolio } = useDeployment();

  const scenario = scenarios.find((s) => s.id === scenarioId) ?? null;

  const body = useMemo(
    () => ({
      instruction,
      context,
      declaredClassification: declared === "auto" ? undefined : declared,
      priorityMode: priority,
      scenarioId: scenarioId ?? undefined,
      simulation: sim.ollamaOffline || sim.providerOutage?.length || sim.sessionSpendUsd !== undefined ? sim : undefined,
      permission: permission.granted ? permission : undefined,
    }),
    [instruction, context, declared, priority, scenarioId, sim, permission],
  );

  // Live dry-run routing as inputs change. No model is called.
  useEffect(() => {
    if (instruction.trim().length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setPlanning(true);
      try {
        const res = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.issues?.join("; ") ?? data.error ?? "Routing failed");
        setPlan(data);
        setPlanError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setPlanError((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setPlanning(false);
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [body, instruction]);

  useEffect(() => {
    if (run.state !== "running") return;
    const id = setInterval(() => setElapsed(Date.now() - (run.startedAt ?? Date.now())), 100);
    return () => clearInterval(id);
  }, [run.state, run.startedAt]);

  const pickScenario = (s: Scenario) => {
    setScenarioId(s.id);
    setInstruction(s.instruction);
    setContext(s.context);
    setDeclared(s.declaredClassification ?? "auto");
    setPriority(s.priorityMode);
    setSim(s.simulation ?? {});
    setPermission({ granted: false, justification: "" });
    setRun({ state: "idle" });
  };

  const bodyKey = JSON.stringify(body);
  const confirmLive = confirmKey === bodyKey;
  const decision = plan?.decision;
  const selected = decision?.candidates.find((c) => c.modelId === decision.selectedModelId);
  const cloudLive = plan?.cloudLive ?? status?.config.cloudLive ?? false;
  const paid = Boolean(selected && selected.location === "cloud" && cloudLive);
  const selectedMaxCost = selected?.cost.maxCostUsd;

  const execute = useCallback(async () => {
    if (!decision || decision.outcome === "blocked" || run.state === "running") return;
    if (paid && !confirmLive) {
      setConfirmKey(bodyKey);
      return;
    }
    setConfirmKey(null);
    setRun({ state: "running", startedAt: Date.now() });
    setElapsed(0);
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }), 60);
    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, allowLive: paid, maxLiveCostUsd: paid ? selectedMaxCost : undefined, source: scenarioId ? "scenario" : "console" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.issues?.join("; ") ?? data.error ?? "Execution failed");
      setRun({ state: "done", record: data.record });
      rememberRecord(data.record);
      announceChange();
    } catch (e) {
      setRun({ state: "error", error: (e as Error).message });
    }
  }, [decision, run.state, paid, confirmLive, body, bodyKey, scenarioId, selectedMaxCost]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        execute();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [execute]);

  const docTokens = estimateTokens(context);
  const simActive = Boolean(sim.ollamaOffline || sim.providerOutage?.length || sim.sessionSpendUsd !== undefined);
  const record = run.state === "done" ? run.record : undefined;

  return (
    <div className="space-y-10">
      <section aria-labelledby="scenarios-title" className="@container">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="scenarios-title" className="eyebrow">
            Try a scenario
          </h2>
          <span className="hidden text-sm text-fg-3 sm:inline">Each one runs the real routing engine</span>
        </div>
        <ScenarioStories
          scenarios={scenarios}
          activeId={scenarioId}
          onPick={pickScenario}
          className="grid-cols-2 @[56rem]:grid-cols-3 @[76rem]:grid-cols-6"
        />
      </section>

      <RequestCard
        editing={editing}
        onEdit={() => setEditing((v) => !v)}
        instruction={instruction}
        context={context}
        docTokens={docTokens}
        declared={declared}
        priority={priority}
        simActive={simActive}
        custom={!scenario}
      >
        <div className="space-y-5">
          <div>
            <label htmlFor="instruction" className="mb-2 block text-sm font-medium text-fg-2">
              Request
            </label>
            <textarea
              id="instruction"
              value={instruction}
              onChange={(e) => {
                setInstruction(e.target.value);
                setScenarioId(null);
              }}
              rows={3}
              className="w-full resize-y rounded-2xl border border-line-strong bg-surface-2/80 px-4 py-3 text-lg text-fg placeholder:text-fg-3 transition-shadow focus:border-brand focus:shadow-[0_0_0_4px_var(--brand-soft)] focus:outline-none"
              placeholder="Describe what the model should do"
            />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="context" className="text-sm font-medium text-fg-2">
                Source document <span className="font-normal text-fg-3">(optional)</span>
              </label>
              <span className="tnum text-sm text-fg-3">~{docTokens.toLocaleString()} tokens</span>
            </div>
            <textarea
              id="context"
              value={context}
              onChange={(e) => {
                setContext(e.target.value);
                setScenarioId(null);
              }}
              rows={6}
              spellCheck={false}
              className="scrollbar-thin w-full resize-y rounded-2xl border border-line-strong bg-surface-2/80 px-4 py-3 font-mono text-[13px] leading-[21px] text-fg-2 placeholder:text-fg-3 transition-shadow focus:border-brand focus:shadow-[0_0_0_4px_var(--brand-soft)] focus:outline-none"
              placeholder="Paste documents the task should use"
            />
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-medium text-fg-2">Data classification</div>
              <Segmented
                ariaLabel="Data classification"
                value={declared}
                onChange={setDeclared}
                options={[
                  { value: "auto", label: "Detect", hint: "Use the sensitivity scanner. Unlabeled content is treated as Internal." },
                  { value: "public", label: "Public" },
                  { value: "internal", label: "Internal" },
                  { value: "confidential", label: "Confid.", hint: "Confidential" },
                  { value: "restricted", label: "Restr.", hint: "Restricted" },
                ]}
              />
              <p className="mt-1.5 text-sm text-fg-3">A declared label can raise the detected level, never lower it.</p>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-fg-2">Priority</div>
              <Segmented ariaLabel="Priority mode" value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: SHORT[p], hint: `${PRIORITY_LABEL[p]}: ${PRIORITY_DESCRIPTION[p]}` }))} />
              <p className="mt-1.5 text-sm text-fg-3">{PRIORITY_DESCRIPTION[priority]}</p>
            </div>
          </div>
          <Disclosure
            title="Exceptions and fault injection"
            hint={simActive ? "Active for this request, recorded as simulated" : "Grant a policy exception or simulate outages"}
            icon={<SlidersHorizontal className="size-[18px]" />}
            defaultOpen={simActive}
            className="bg-surface-2/40"
          >
            <div className="space-y-5 text-sm">
              <div>
                <label className="flex items-center gap-2.5 text-fg-2">
                  <input type="checkbox" className="size-4 accent-[var(--review)]" checked={permission.granted} onChange={(e) => setPermission((p) => ({ ...p, granted: e.target.checked }))} />
                  Grant explicit cloud permission (confidential data only)
                </label>
                {permission.granted ? (
                  <input
                    value={permission.justification}
                    onChange={(e) => setPermission((p) => ({ ...p, justification: e.target.value }))}
                    placeholder="Justification (required, recorded in the trace)"
                    aria-label="Justification"
                    className="mt-2 h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-3 focus:border-fg-3 focus:outline-none"
                  />
                ) : null}
              </div>
              <fieldset className="space-y-2.5 border-t border-line pt-4">
                <legend className="mb-2 flex items-center gap-2 text-sm font-medium text-fg">
                  <FlaskConical className="size-4 text-fg-3" /> Fault injection <span className="font-normal text-fg-3">(recorded in the trace as simulated)</span>
                </legend>
                <label className="flex items-center gap-2.5 text-fg-2">
                  <input type="checkbox" className="size-4" checked={Boolean(sim.ollamaOffline)} onChange={(e) => setSim((s) => ({ ...s, ollamaOffline: e.target.checked || undefined }))} />
                  Local AI offline
                </label>
                <label className="flex items-center gap-2.5 text-fg-2">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={Boolean(sim.providerOutage?.includes("anthropic"))}
                    onChange={(e) => setSim((s) => ({ ...s, providerOutage: e.target.checked ? ["anthropic"] : undefined }))}
                  />
                  Anthropic API outage
                </label>
                <label className="flex items-center gap-2.5 text-fg-2">
                  <input type="checkbox" className="size-4" checked={sim.sessionSpendUsd !== undefined} onChange={(e) => setSim((s) => ({ ...s, sessionSpendUsd: e.target.checked ? 1.995 : undefined }))} />
                  Session budget nearly spent ({formatUsd(1.995)} of the budget used)
                </label>
              </fieldset>
            </div>
          </Disclosure>
          <p className="text-sm text-fg-3">The route updates as you type. Nothing runs until you press Run.</p>
        </div>
      </RequestCard>

      <section aria-labelledby="flow-title" className="card card-glow @container overflow-hidden p-5 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full bg-brand/20 blur-3xl" aria-hidden />
        <div className="mb-8 grid gap-4 @[44rem]:grid-cols-[minmax(0,1fr)_auto] @[44rem]:items-start">
          <div>
            <h2 id="flow-title" className="flex items-center gap-3 text-2xl font-semibold text-fg">
              <span className="icon-tile size-10">
                <RouteGlyph className="size-5" strokeWidth={1.9} />
              </span>
              Routing decision
              {planning && decision ? <Loader2 className="size-4 animate-spin text-fg-3" aria-label="Updating" /> : null}
            </h2>
            <p className="mt-0.5 text-sm text-fg-3">A live dry run of the real engine. Nothing executes until you press Run.</p>
          </div>
          <RunButton
            disabled={!decision || decision.outcome === "blocked" || run.state === "running" || planning}
            running={run.state === "running"}
            blocked={decision?.outcome === "blocked"}
            selectedName={selected?.shortName}
            location={selected?.location}
            cloudLive={cloudLive}
            confirm={confirmLive}
            maxCost={selected?.cost.maxCostUsd ?? 0}
            portfolio={portfolio}
            onClick={execute}
          />
        </div>
        {planError ? (
          <div className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger-ink">{planError}</div>
        ) : decision ? (
          <div className={cn("transition-opacity duration-[var(--dur)]", planning && "opacity-80")}>
            <RouteFlow decision={decision} record={record} />
          </div>
        ) : (
          <Skeleton className="h-[288px] w-full rounded-xl" />
        )}
        {scenario && decision ? (
          <div className="mt-8 flex items-start gap-3 border-t border-line pt-5">
            <Lightbulb className="mt-0.5 size-[18px] shrink-0 text-fg-3" aria-hidden />
            <p className="text-md text-fg-2">
              <span className="font-medium text-fg">{(SCENARIO_STORY[scenario.id]?.title ?? scenario.title).replace(/\.$/, "")}.</span> {scenario.lesson}
              {SCENARIO_STORY[scenario.id]?.runHint && !record ? <span className="mt-1 block text-fg-3">{SCENARIO_STORY[scenario.id]?.runHint}</span> : null}
            </p>
          </div>
        ) : null}
      </section>

      {decision ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <OutcomeCard decision={decision} record={record} />
          <WhyList decision={decision} className="card p-6" />
        </div>
      ) : null}

      {decision ? <DecisionDetails decision={decision} /> : null}

      <div ref={resultRef} className="scroll-mt-24" aria-live="polite">
        {run.state === "running" && selected ? <Running name={selected.displayName} local={selected.location === "local"} cloudLive={cloudLive} portfolio={portfolio} elapsed={elapsed} estimate={selected.latency.totalMs} /> : null}
        {run.state === "error" ? <div className="rounded-xl border border-danger-line bg-danger-soft px-5 py-4 text-sm text-danger-ink">{run.error}</div> : null}
        {run.state === "done" && run.record ? (
          <section aria-labelledby="result-title" className="card animate-rise p-5 sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 id="result-title" className="eyebrow">
                Result
              </h2>
              <Button size="sm" variant="ghost" onClick={() => setRun({ state: "idle" })}>
                <RotateCcw className="size-4" /> Clear
              </Button>
            </div>
            <ExecutionResult r={run.record} />
          </section>
        ) : null}
      </div>
    </div>
  );
}

function RequestCard({
  editing,
  onEdit,
  instruction,
  context,
  docTokens,
  declared,
  priority,
  simActive,
  custom,
  children,
}: {
  editing: boolean;
  onEdit: () => void;
  instruction: string;
  context: string;
  docTokens: number;
  declared: DataClassification | "auto";
  priority: PriorityMode;
  simActive: boolean;
  custom: boolean;
  children: React.ReactNode;
}) {
  const chip = "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface-2/80 px-3 text-sm text-fg-2";
  return (
    <section aria-labelledby="request-title" className="card">
      <div className="p-5 sm:px-8 sm:py-6">
        <div className="flex items-center justify-between gap-4">
          <h2 id="request-title" className="eyebrow">
            {custom ? "Your request" : "Request"}
          </h2>
          <Button variant="secondary" size="sm" onClick={onEdit} aria-expanded={editing}>
            <Pencil className="size-3.5" /> {editing ? "Done" : "Edit request"}
          </Button>
        </div>
        <div className="min-w-0">
          {!editing ? (
            <>
              <p className="mt-3 line-clamp-3 max-w-4xl font-display text-xl leading-8 text-fg sm:line-clamp-2">{instruction}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {context.trim() ? (
                  <span className={chip}>
                    <FileText className="size-4 text-fg-3" /> Source document · ~{docTokens.toLocaleString()} tokens
                  </span>
                ) : null}
                <span className={chip}>{declared === "auto" ? "Classification auto-detected" : `Declared ${CLASSIFICATION_META[declared].label.toLowerCase()}`}</span>
                <span className={chip}>{PRIORITY_LABEL[priority]}</span>
                {simActive ? (
                  <span className={chip}>
                    <FlaskConical className="size-4 text-fg-3" /> Fault injection on
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
      {editing ? <div className="border-t border-line p-5 sm:px-8 sm:py-6">{children}</div> : null}
    </section>
  );
}

function RunButton(p: {
  disabled: boolean;
  running: boolean;
  blocked?: boolean;
  selectedName?: string;
  location?: "local" | "cloud";
  cloudLive: boolean;
  confirm: boolean;
  maxCost: number;
  portfolio: boolean;
  onClick: () => void;
}) {
  if (p.blocked) {
    return (
      <span className="inline-flex h-11 items-center gap-2 rounded-lg border border-blocked-line bg-blocked-soft px-4 text-sm font-medium text-blocked-ink">
        <ShieldBan className="size-4" /> Blocked: nothing will run
      </span>
    );
  }
  const local = p.location === "local";
  const label = p.running
    ? "Running…"
    : p.portfolio
      ? `Run on ${p.selectedName ?? "…"} (simulated)`
      : p.confirm
        ? `Confirm paid call · up to ${formatUsd(p.maxCost)}`
        : local
          ? `Run locally on ${p.selectedName}`
          : p.cloudLive
            ? `Run on ${p.selectedName} · Live API`
            : `Run on ${p.selectedName ?? "…"} (simulated)`;
  const icon = p.running ? <Loader2 className="size-4 animate-spin" /> : p.portfolio ? <Play className="size-4" /> : local ? <Laptop className="size-4" /> : p.cloudLive ? <Radio className="size-4" /> : <Play className="size-4" />;
  const note = p.portfolio
    ? local
      ? "Simulated here. On a local install this runs through Ollama at $0."
      : "Simulated here. No provider credentials are used in Portfolio Mode."
    : local
      ? "Real on-device inference via Ollama · $0 external cost"
      : p.cloudLive
        ? "Paid API call · worst case reserved before the call"
        : "Cloud is simulated until live mode is enabled";
  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:items-start @[44rem]:items-end">
      <Button variant={p.confirm ? "review" : "primary"} size="lg" disabled={p.disabled} onClick={p.onClick} className="w-full sm:w-auto">
        {icon}
        {label}
        {!p.running ? (
          <span className="ml-1 hidden items-center gap-1 opacity-60 sm:inline-flex" aria-hidden>
            <span className="text-[13px] leading-none">⌘</span>
            <CornerDownLeft className="size-3.5" />
          </span>
        ) : null}
      </Button>
      <span className="text-center text-xs text-fg-3 sm:text-left @[44rem]:text-right">{note}</span>
    </div>
  );
}

const STAGES = ["Classify", "Policy", "Score", "Budget", "Route", "Execute", "Evaluate"];

function Running({ name, local, cloudLive, portfolio, elapsed, estimate }: { name: string; local: boolean; cloudLive: boolean; portfolio: boolean; elapsed: number; estimate: number }) {
  const simulated = portfolio || (!local && !cloudLive);
  const stage = Math.min(STAGES.length - 1, Math.floor(elapsed / (simulated ? 170 : Math.max(400, estimate / STAGES.length))));
  return (
    <section className="card animate-rise p-5 sm:p-8" aria-label="Running">
      <div className="flex items-center gap-3">
        <Loader2 className="size-5 animate-spin text-fg-3" />
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold text-fg">{simulated ? `Simulating ${name}` : local ? `Running on ${name}` : `Calling ${name}`}</div>
          <div className="text-sm text-fg-3">
            {portfolio ? "Portfolio Mode: no model is called from this site." : local ? "On this device via Ollama. Nothing leaves the machine." : cloudLive ? "Worst-case cost reserved against the session budget." : "A simulated provider answers; no API call is made."}
          </div>
        </div>
        <span className="tnum font-mono text-sm text-fg-2">{formatMs(elapsed)}</span>
      </div>
      <ol className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-7">
        {STAGES.map((s, i) => (
          <li
            key={s}
            className={cn(
              "flex h-9 items-center justify-center rounded-lg border text-sm transition-colors duration-[var(--dur)]",
              i < stage ? "border-line-strong bg-surface-2 text-fg-2" : i === stage ? "border-fg-3 bg-surface-3 font-medium text-fg" : "border-line text-fg-3",
            )}
          >
            {s}
          </li>
        ))}
      </ol>
    </section>
  );
}
