"use client";

import { ChevronDown, CornerDownLeft, FlaskConical, HardDrive, Loader2, Play, Radio, RotateCcw, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PRIORITY_DESCRIPTION, PRIORITY_LABEL } from "@/core/routing/config";
import { estimateTokens } from "@/core/pricing/tokens";
import type { DataClassification, PriorityMode, RoutingDecision, SimulationOptions, TraceEvent } from "@/core/types";
import type { Scenario } from "@/scenarios/scenarios";
import type { ExecutionRecord } from "@/services/observability/types";
import { useDeployment } from "@/components/shell/deployment-context";
import { announceChange, useStatus } from "@/components/shell/status-context";
import { rememberRecord } from "@/lib/session-records";
import { Segmented } from "@/components/ui/segmented";
import { Button, Kbd, Panel, SectionLabel, Skeleton } from "@/components/ui/primitives";
import { cn, formatMs, formatUsd } from "@/lib/format";
import { DecisionPanel, ProfileChips } from "./decision-panel";
import { ExecutionResult } from "./execution-result";

interface PlanResponse {
  decision: RoutingDecision;
  trace: TraceEvent[];
  cloudLive: boolean;
}

const PRIORITIES: PriorityMode[] = ["lowest_cost", "balanced", "best_quality", "fastest", "privacy_first"];
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
  const [advanced, setAdvanced] = useState(Boolean(first.simulation));

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

  // Live dry-run routing as inputs change.
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
    if (s.simulation) setAdvanced(true);
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
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
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

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[372px_minmax(0,1fr)]">
      {/* Composer */}
      <Panel className="xl:sticky xl:top-[68px]">
        <div className="border-b border-line p-3">
          <SectionLabel className="mb-2 px-1">Demo scenarios</SectionLabel>
          <div className="space-y-1">
            {scenarios.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pickScenario(s)}
                className={cn(
                  "group flex w-full items-start gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors",
                  scenarioId === s.id ? "border-line-strong bg-surface-3" : "border-transparent hover:bg-surface-2",
                )}
              >
                <span className={cn("tnum mt-px font-mono text-2xs", scenarioId === s.id ? "text-fg" : "text-fg-4")}>{String(s.number).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <span className={cn("block truncate text-sm", scenarioId === s.id ? "font-medium text-fg" : "text-fg-2")}>{s.title}</span>
                  <span className="block truncate text-xs text-fg-3">{s.expected}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="instruction" className="text-xs font-medium text-fg-2">
                Task
              </label>
              {!scenario ? <span className="text-2xs text-fg-4">custom</span> : null}
            </div>
            <textarea
              id="instruction"
              value={instruction}
              onChange={(e) => {
                setInstruction(e.target.value);
                setScenarioId(null);
              }}
              rows={4}
              className="w-full resize-y rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-4 focus:border-line-strong focus:outline-none"
              placeholder="Describe what the model should do"
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="context" className="text-xs font-medium text-fg-2">
                Source documents
              </label>
              <span className="tnum text-2xs text-fg-4">~{docTokens.toLocaleString()} tokens</span>
            </div>
            <textarea
              id="context"
              value={context}
              onChange={(e) => {
                setContext(e.target.value);
                setScenarioId(null);
              }}
              rows={7}
              spellCheck={false}
              className="scrollbar-thin w-full resize-y rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-xs leading-5 text-fg-2 placeholder:text-fg-4 focus:border-line-strong focus:outline-none"
              placeholder="Paste documents the task should use (optional)"
            />
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium text-fg-2">Data classification</div>
            <Segmented
              ariaLabel="Data classification"
              size="sm"
              value={declared}
              onChange={setDeclared}
              options={[
                { value: "auto", label: "Detect", hint: "Use the sensitivity scanner. Unlabeled content defaults to Internal." },
                { value: "public", label: "Public" },
                { value: "internal", label: "Internal" },
                { value: "confidential", label: "Confid." , hint: "Confidential" },
                { value: "restricted", label: "Restr.", hint: "Restricted" },
              ]}
            />
            <p className="mt-1 text-2xs text-fg-4">A declared label can raise the detected level, never lower it.</p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-fg-2">Priority</span>
              <span className="text-fg-4">{PRIORITY_LABEL[priority]}</span>
            </div>
            <Segmented ariaLabel="Priority mode" value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: SHORT[p], hint: `${PRIORITY_LABEL[p]}: ${PRIORITY_DESCRIPTION[p]}` }))} />
          </div>

          <div className="rounded-md border border-line">
            <button type="button" onClick={() => setAdvanced((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-fg-2 hover:text-fg">
              <SlidersHorizontal className="size-3.5" />
              Policy exception & simulation
              {sim.ollamaOffline || sim.providerOutage?.length || sim.sessionSpendUsd !== undefined ? (
                <span className="rounded bg-warn-soft px-1.5 text-2xs leading-4 text-warn-fg">active</span>
              ) : null}
              <ChevronDown className={cn("ml-auto size-3.5 transition-transform", advanced && "rotate-180")} />
            </button>
            {advanced ? (
              <div className="space-y-3 border-t border-line px-3 py-3 text-xs">
                <div>
                  <label className="flex items-center gap-2 text-fg-2">
                    <input type="checkbox" className="accent-[var(--warn)]" checked={permission.granted} onChange={(e) => setPermission((p) => ({ ...p, granted: e.target.checked }))} />
                    Grant explicit cloud permission (confidential only)
                  </label>
                  {permission.granted ? (
                    <input
                      value={permission.justification}
                      onChange={(e) => setPermission((p) => ({ ...p, justification: e.target.value }))}
                      placeholder="Justification (required, recorded in the trace)"
                      className="mt-1.5 w-full rounded border border-line bg-surface-2 px-2 py-1 text-xs text-fg focus:border-line-strong focus:outline-none"
                    />
                  ) : null}
                </div>
                <div className="space-y-1.5 border-t border-line pt-3">
                  <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.08em] text-warn-fg">
                    <FlaskConical className="size-3" /> Fault injection (recorded as simulated)
                  </div>
                  <label className="flex items-center gap-2 text-fg-2">
                    <input type="checkbox" checked={Boolean(sim.ollamaOffline)} onChange={(e) => setSim((s) => ({ ...s, ollamaOffline: e.target.checked || undefined }))} />
                    Ollama offline
                  </label>
                  <label className="flex items-center gap-2 text-fg-2">
                    <input
                      type="checkbox"
                      checked={Boolean(sim.providerOutage?.includes("anthropic"))}
                      onChange={(e) => setSim((s) => ({ ...s, providerOutage: e.target.checked ? ["anthropic"] : undefined }))}
                    />
                    Anthropic API outage (503)
                  </label>
                  <label className="flex items-center gap-2 text-fg-2">
                    <input
                      type="checkbox"
                      checked={sim.sessionSpendUsd !== undefined}
                      onChange={(e) => setSim((s) => ({ ...s, sessionSpendUsd: e.target.checked ? 1.995 : undefined }))}
                    />
                    Session budget nearly spent ({formatUsd(1.995)} spent)
                  </label>
                </div>
              </div>
            ) : null}
          </div>

          <ExecuteButton
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
      </Panel>

      {/* Decision */}
      <div className="min-w-0 space-y-4">
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div>
              <h2 className="text-sm font-medium text-fg">Routing decision</h2>
              <p className="text-xs text-fg-3">Dry run · updates as you edit · no model is called until you execute</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-fg-3">
              {planning ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {decision ? <ProfileChips decision={decision} /> : null}
            </div>
          </div>
          <div className={cn("p-4 transition-opacity duration-200", planning && decision && "opacity-70")}>
            {planError ? (
              <div className="rounded-md border border-danger/35 bg-danger-soft px-3 py-2 text-sm text-danger-fg">{planError}</div>
            ) : decision ? (
              <DecisionPanel decision={decision} />
            ) : (
              <DecisionSkeleton />
            )}
            {scenario && decision ? (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-xs text-fg-2">
                <span className="font-mono text-fg-4">{String(scenario.number).padStart(2, "0")}</span>
                <span>
                  <span className="font-medium text-fg">What this shows:</span> {scenario.lesson}
                </span>
              </div>
            ) : null}
          </div>
        </Panel>

        <div ref={resultRef} className="scroll-mt-16">
          {run.state === "running" && selected ? (
            <RunningCard name={selected.displayName} location={selected.location} cloudLive={cloudLive} elapsed={elapsed} estimate={selected.latency.totalMs} portfolio={portfolio} />
          ) : null}
          {run.state === "error" ? <div className="rounded-lg border border-danger/35 bg-danger-soft px-4 py-3 text-sm text-danger-fg">{run.error}</div> : null}
          {run.state === "done" && run.record ? (
            <Panel className="animate-rise">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h2 className="text-sm font-medium text-fg">Execution</h2>
                <Button size="sm" variant="ghost" onClick={() => setRun({ state: "idle" })}>
                  <RotateCcw className="size-3.5" /> Clear
                </Button>
              </div>
              <div className="p-4">
                <ExecutionResult r={run.record} />
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ExecuteButton(p: {
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
      <div className="flex items-center gap-2 rounded-md border border-blocked-line bg-blocked-soft px-3 py-2.5 text-xs text-blocked-fg">
        <ShieldAlert className="size-4" /> Blocked by governance. Nothing will be executed.
      </div>
    );
  }
  const local = p.location === "local";
  if (p.portfolio) {
    return (
      <div>
        <Button variant="primary" className="h-9 w-full text-sm" disabled={p.disabled} onClick={p.onClick}>
          {p.running ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
          {p.running ? "Running…" : `Run (simulated) on ${p.selectedName ?? "…"}`}
        </Button>
        <p className="mt-1.5 text-center text-2xs text-fg-4">
          {local
            ? `Portfolio demo: on a local install ${p.selectedName} runs through Ollama, at $0.00 API cost`
            : `Portfolio demo: ${p.selectedName} is not called; no API key exists here`}
        </p>
      </div>
    );
  }
  const label = p.running
    ? "Running…"
    : p.confirm
      ? `Confirm paid call · up to ${formatUsd(p.maxCost)}`
      : local
        ? `Run locally on ${p.selectedName}`
        : p.cloudLive
          ? `Run on ${p.selectedName} · LIVE API`
          : `Run on ${p.selectedName ?? "…"} · DEMO`;
  return (
    <div>
      <Button variant={local ? "local" : p.cloudLive ? "cloud" : "primary"} className="h-9 w-full text-sm" disabled={p.disabled} onClick={p.onClick}>
        {p.running ? <Loader2 className="size-4 animate-spin" /> : local ? <HardDrive className="size-4" /> : p.cloudLive ? <Radio className="size-4" /> : <Play className="size-4" />}
        {label}
        {!p.running ? (
          <span className="ml-1 hidden items-center gap-0.5 opacity-70 sm:inline-flex">
            <Kbd>⌘</Kbd>
            <CornerDownLeft className="size-3" />
          </span>
        ) : null}
      </Button>
      <p className="mt-1.5 text-center text-2xs text-fg-4">
        {local
          ? "Real on-device inference via Ollama · $0.00 external API cost"
          : p.cloudLive
            ? "Paid API call · worst-case cost reserved before the call"
            : "Cloud is in DEMO mode: output is simulated and labeled"}
      </p>
    </div>
  );
}

const STAGES = ["Classify", "Governance", "Score", "Budget", "Route", "Execute", "Evaluate"];

function RunningCard({ name, location, cloudLive, elapsed, estimate, portfolio }: { name: string; location: "local" | "cloud"; cloudLive: boolean; elapsed: number; estimate: number; portfolio: boolean }) {
  const local = location === "local";
  if (portfolio) {
    const stage = Math.min(STAGES.length - 1, Math.floor(elapsed / 160));
    return (
      <Panel className="animate-rise p-4">
        <div className="flex items-center gap-3">
          <Loader2 className={cn("size-4 animate-spin", local ? "text-local-fg" : "text-cloud-fg")} />
          <div className="flex-1 text-sm font-medium text-fg">Simulated execution on {name}</div>
          <span className="tnum text-xs text-fg-3">{formatMs(elapsed)}</span>
        </div>
        <ol className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {STAGES.map((s, i) => (
            <li
              key={s}
              className={cn(
                "rounded-[5px] border px-2 py-1 text-center text-2xs transition-colors",
                i < stage ? "border-ok/30 bg-ok/10 text-ok-fg" : i === stage ? "border-line-strong bg-surface-3 text-fg" : "border-line text-fg-4",
              )}
            >
              {s}
            </li>
          ))}
        </ol>
      </Panel>
    );
  }
  const pct = Math.min(95, (elapsed / Math.max(estimate, 1500)) * 100);
  return (
    <Panel className="animate-rise p-4">
      <div className="flex items-center gap-3">
        <Loader2 className={cn("size-4 animate-spin", local ? "text-local-fg" : "text-cloud-fg")} />
        <div className="flex-1">
          <div className="text-sm font-medium text-fg">
            {local ? `Local inference on ${name}` : cloudLive ? `Calling ${name} (live API)` : `Simulating ${name} (DEMO)`}
          </div>
          <div className="text-xs text-fg-3">
            {local ? "Running on this device via Ollama. Nothing leaves the machine." : cloudLive ? "Worst-case cost reserved against the session budget." : "MockProvider is answering; no API call is made."}
          </div>
        </div>
        <div className="tnum text-right text-xs text-fg-2">
          {formatMs(elapsed)}
          <div className="text-2xs text-fg-4">est. {formatMs(estimate)}</div>
        </div>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${pct}%`, background: local ? "var(--local)" : "var(--cloud)" }} />
      </div>
    </Panel>
  );
}

function DecisionSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-[150px] w-full rounded-lg" />
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-28 w-full rounded-lg" />
    </div>
  );
}
