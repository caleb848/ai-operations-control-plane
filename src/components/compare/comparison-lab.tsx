"use client";

import { Award, ChevronDown, FlaskConical, HardDrive, Loader2, Lock, Play, Radio, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { recommend, type ComparisonRun } from "@/core/evaluation/recommend";
import { isRunnable } from "@/core/routing/engine";
import { PRIORITY_DESCRIPTION, PRIORITY_LABEL } from "@/core/routing/config";
import type { CandidateEvaluation, DataClassification, PriorityMode, RoutingDecision } from "@/core/types";
import type { Scenario } from "@/scenarios/scenarios";
import type { ExecutionRecord } from "@/services/observability/types";
import { recordedReplay } from "@/components/routing/execution-result";
import { useDeployment } from "@/components/shell/deployment-context";
import { announceChange, useStatus } from "@/components/shell/status-context";
import { rememberRecord } from "@/lib/session-records";
import { CandidateStatusBadge, ClassificationBadge, LocationChip, ModeBadge } from "@/components/ui/badges";
import { Markdown } from "@/components/ui/markdown";
import { Button, Panel, SectionLabel, Skeleton, Tip } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { cn, formatMs, formatTokens, formatUsd, PROVIDER_NAME } from "@/lib/format";

/** "estimate" = cloud model in DEMO mode: not called, shown with the router's estimates only. */
type RunState = { state: "queued" | "running" | "done" | "skipped" | "estimate" | "error"; record?: ExecutionRecord; error?: string };

const PRIORITIES: PriorityMode[] = ["lowest_cost", "balanced", "best_quality", "fastest", "privacy_first"];
const SHORT: Record<PriorityMode, string> = { lowest_cost: "Cost", balanced: "Balanced", best_quality: "Quality", fastest: "Speed", privacy_first: "Privacy" };
const isGated = (status: CandidateEvaluation["status"]) => !isRunnable(status);

export function ComparisonLab({ scenarios, initialScenarioId }: { scenarios: Scenario[]; initialScenarioId?: string }) {
  const first = scenarios.find((s) => s.id === initialScenarioId) ?? scenarios.find((s) => s.id === "public-summary") ?? scenarios[0];
  const [scenarioId, setScenarioId] = useState<string | null>(first.id);
  const [instruction, setInstruction] = useState(first.instruction);
  const [context, setContext] = useState(first.context);
  const [declared, setDeclared] = useState<DataClassification | undefined>(first.declaredClassification);
  const [priority, setPriority] = useState<PriorityMode>(first.priorityMode === "best_quality" ? "balanced" : first.priorityMode);
  const [editing, setEditing] = useState(false);
  const [decision, setDecision] = useState<RoutingDecision | null>(null);
  const [cloudLive, setCloudLive] = useState(false);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const { status } = useStatus();
  const { portfolio } = useDeployment();

  const body = useMemo(
    () => ({ instruction, context, declaredClassification: declared, priorityMode: priority, scenarioId: scenarioId ?? undefined }),
    [instruction, context, declared, priority, scenarioId],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
        if (!res.ok) return;
        const data = await res.json();
        setDecision(data.decision);
        setCloudLive(data.cloudLive);
        setSelected((prev) => prev ?? new Set(data.decision.candidates.map((c: CandidateEvaluation) => c.modelId)));
      } catch {
        /* superseded by a newer request */
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [body]);

  // Column order: local first, then cloud by tier, independent of routing rank.
  const columns = useMemo(() => {
    if (!decision) return [];
    const tierOrder = { local: 0, economical: 1, general: 2, premium: 3 } as const;
    return [...decision.candidates].sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier] || a.shortName.localeCompare(b.shortName));
  }, [decision]);
  const active = columns.filter((c) => selected?.has(c.modelId));

  const pickScenario = (id: string) => {
    const s = scenarios.find((x) => x.id === id);
    if (!s) return;
    setScenarioId(s.id);
    setInstruction(s.instruction);
    setContext(s.context);
    setDeclared(s.declaredClassification);
    setRuns({});
  };

  const runnable = active.filter((c) => !isGated(c.status) && (c.location === "local" || cloudLive));
  const estimateOnly = active.filter((c) => !isGated(c.status) && c.location === "cloud" && !cloudLive);
  const paidCols = cloudLive ? runnable.filter((c) => c.location === "cloud") : [];
  const worstCase = paidCols.reduce((s, c) => s + c.cost.maxCostUsd, 0);
  const localCount = runnable.filter((c) => c.location === "local").length;
  const estLocalMs = runnable.filter((c) => c.location === "local").reduce((s, c) => s + c.latency.totalMs, 0);

  const runAll = async () => {
    if (!decision || busy) return;
    if (paidCols.length && !confirm) {
      setConfirm(true);
      return;
    }
    setConfirm(false);
    setBusy(true);
    const initial: Record<string, RunState> = {};
    for (const c of active) initial[c.modelId] = isGated(c.status) ? { state: "skipped" } : estimateOnly.includes(c) ? { state: "estimate" } : { state: "queued" };
    setRuns(initial);
    // Sequential on purpose: one local model fits in memory at a time, and paid calls stay controlled.
    // In DEMO mode cloud models are not called at all; they keep their estimates.
    for (const c of runnable) {
      setRuns((r) => ({ ...r, [c.modelId]: { state: "running" } }));
      try {
        const res = await fetch("/api/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, pinModelId: c.modelId, source: "compare", allowLive: cloudLive && c.location === "cloud" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        const rec: ExecutionRecord = data.record;
        rememberRecord(rec);
        setRuns((r) => ({ ...r, [c.modelId]: rec.status === "completed" ? { state: "done", record: rec } : { state: "error", record: rec, error: rec.error ?? rec.status } }));
      } catch (e) {
        setRuns((r) => ({ ...r, [c.modelId]: { state: "error", error: (e as Error).message } }));
      }
    }
    setBusy(false);
    announceChange();
  };

  const rec = useMemo(() => {
    if (!decision) return null;
    const results: ComparisonRun[] = active
      .filter((c) => runs[c.modelId])
      .map((c) => {
        const r = runs[c.modelId];
        const x = r.record;
        return {
          candidate: c,
          status: r.state === "done" ? "completed" : r.state === "estimate" ? "estimated" : r.state === "error" ? "failed" : "skipped",
          mode: x?.mode ?? null,
          evalScore: x?.evalScore ?? null,
          latencyMs: x?.latencyMs ?? null,
          latencySource: x?.latencySource ?? null,
          recorded: x ? recordedReplay(x) !== null : false,
          costUsd: x ? (x.mode === "demo" ? x.simulatedCostUsd : x.externalCostUsd) : 0,
        };
      });
    return results.some((r) => r.status === "completed") ? recommend(results, priority, decision.profile.classification) : null;
  }, [active, runs, priority, decision]);

  const scenario = scenarios.find((s) => s.id === scenarioId);

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 p-4">
          <div className="min-w-[240px] flex-1">
            <div className="mb-1.5 text-xs font-medium text-fg-2">Task</div>
            <div className="relative">
              <select
                value={scenarioId ?? ""}
                onChange={(e) => pickScenario(e.target.value)}
                className="h-8 w-full appearance-none rounded-md border border-line bg-surface-2 pl-3 pr-8 text-sm text-fg focus:border-line-strong focus:outline-none"
              >
                {!scenarioId ? <option value="">Custom task</option> : null}
                {scenarios
                  .filter((s) => !s.simulation)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {String(s.number).padStart(2, "0")} · {s.title}
                    </option>
                  ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2 size-4 text-fg-3" />
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-fg-2">Priority (for the recommendation)</div>
            <Segmented ariaLabel="Priority" value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: SHORT[p], hint: `${PRIORITY_LABEL[p]}: ${PRIORITY_DESCRIPTION[p]}` }))} />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
              {editing ? "Hide" : "Edit"} task text
            </Button>
            <Button variant={paidCols.length ? "cloud" : "primary"} disabled={!decision || busy || !runnable.length} onClick={runAll} className="h-8">
              {busy ? <Loader2 className="size-4 animate-spin" /> : paidCols.length ? <Radio className="size-4" /> : <Play className="size-4" />}
              {busy
                ? "Running…"
                : portfolio
                  ? `Run simulated comparison`
                  : confirm
                  ? `Confirm · up to ${formatUsd(worstCase)}`
                  : `Run ${localCount} local${paidCols.length ? ` + ${paidCols.length} live` : ""} model${runnable.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
        {editing ? (
          <div className="grid grid-cols-1 gap-3 border-t border-line p-4 md:grid-cols-2">
            <textarea
              value={instruction}
              onChange={(e) => {
                setInstruction(e.target.value);
                setScenarioId(null);
              }}
              rows={5}
              className="rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-fg focus:border-line-strong focus:outline-none"
            />
            <textarea
              value={context}
              onChange={(e) => {
                setContext(e.target.value);
                setScenarioId(null);
              }}
              rows={5}
              spellCheck={false}
              className="rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-fg-2 focus:border-line-strong focus:outline-none"
            />
          </div>
        ) : (
          <div className="border-t border-line px-4 py-2.5 text-xs text-fg-3">
            <span className="text-fg-2">{instruction}</span>
            {decision ? (
              <span className="ml-2 inline-flex translate-y-[3px] items-center gap-1.5">
                <ClassificationBadge value={decision.profile.classification} size="xs" />
              </span>
            ) : null}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-xs text-fg-3">
          <span>
            {portfolio
              ? `${localCount} local: simulated, replaying recorded real runs where available`
              : `${localCount} local run${localCount === 1 ? "" : "s"} (real, ~${formatMs(estLocalMs)} sequential)`}
          </span>
          <span>·</span>
          <span>
            {cloudLive
              ? `${paidCols.length} cloud live (worst case ${formatUsd(worstCase)})`
              : `${estimateOnly.length} cloud not called (DEMO): estimates only`}
          </span>
          {active.filter((c) => isGated(c.status)).length ? (
            <>
              <span>·</span>
              <span className="text-blocked-fg">{active.filter((c) => isGated(c.status)).length} blocked (policy or availability)</span>
            </>
          ) : null}
          <span className="ml-auto">Policy applies here too: blocked models are never called.</span>
        </div>
      </Panel>

      {rec && rec.modelId && decision ? <RecommendationCard rec={rec} decision={decision} /> : null}

      <Panel className="overflow-hidden">
        {!decision ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[156px]" />
                {columns.map((c) => (
                  <col key={c.modelId} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-line align-top">
                  <th className="px-4 py-3 text-left text-xs font-normal text-fg-3">Model</th>
                  {columns.map((c) => {
                    const on = selected?.has(c.modelId) ?? true;
                    const isRec = rec?.modelId === c.modelId;
                    return (
                      <th key={c.modelId} className={cn("border-l border-line px-3 py-3 text-left font-normal", !on && "opacity-40", isRec && (c.location === "local" ? "bg-local-soft" : "bg-cloud-soft"))}>
                        <label className="flex cursor-pointer items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={on}
                            onChange={(e) =>
                              setSelected((prev) => {
                                const n = new Set(prev ?? []);
                                if (e.target.checked) n.add(c.modelId);
                                else n.delete(c.modelId);
                                return n;
                              })
                            }
                          />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-fg">
                              {c.shortName}
                              {isRec ? <Award className="size-3.5 shrink-0 text-ok-fg" /> : null}
                            </span>
                            <span className="mt-1 flex flex-wrap gap-1">
                              <LocationChip location={c.location} size="xs" />
                            </span>
                          </span>
                        </label>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <Row label="Policy status">
                  {columns.map((c) => (
                    <Cell key={c.modelId} c={c} selected={selected} rec={rec?.modelId}>
                      {isGated(c.status) ? (
                        <Tip content={c.reasons.find((r) => r.severity === "block")?.message ?? ""}>
                          <span>
                            <CandidateStatusBadge status={c.status} location={c.location} />
                          </span>
                        </Tip>
                      ) : (
                        <span className="text-xs text-ok-fg">Permitted</span>
                      )}
                    </Cell>
                  ))}
                </Row>
                <Row label="Execution">
                  {columns.map((c) => (
                    <Cell key={c.modelId} c={c} selected={selected} rec={rec?.modelId}>
                      <ExecCell c={c} run={runs[c.modelId]} cloudLive={cloudLive} portfolio={portfolio} />
                    </Cell>
                  ))}
                </Row>
                <Row label="Data location">
                  {columns.map((c) => (
                    <Cell key={c.modelId} c={c} selected={selected} rec={rec?.modelId}>
                      <span className={cn("text-xs", c.location === "local" ? "text-local-fg" : "text-fg-2")}>{c.location === "local" ? (portfolio ? "Developer's Mac (reference)" : "This device") : `${PROVIDER_NAME[c.providerId]} API (cloud)`}</span>
                    </Cell>
                  ))}
                </Row>
                <Row label="Routing score" hint="From the router, before execution">
                  {columns.map((c) => (
                    <Cell key={c.modelId} c={c} selected={selected} rec={rec?.modelId}>
                      <span className="tnum text-base font-semibold text-fg">{c.routingScore != null ? Math.round(c.routingScore) : "—"}</span>
                      <span className="tnum ml-1.5 text-xs text-fg-4">
                        Q {Math.round(c.quality.score)}/{c.quality.required}
                      </span>
                    </Cell>
                  ))}
                </Row>
                <Row label="Evaluation estimate" hint="Heuristic checks on the actual output">
                  {columns.map((c) => {
                    const r = runs[c.modelId]?.record;
                    return (
                      <Cell key={c.modelId} c={c} selected={selected} rec={rec?.modelId}>
                        {runs[c.modelId]?.state === "estimate" || (!cloudLive && c.location === "cloud" && !isGated(c.status)) ? (
                          <span className="text-xs text-fg-4">n/a · not called</span>
                        ) : r && r.evalScore == null ? (
                          <span className="text-xs text-fg-4">n/a · simulated text</span>
                        ) : r?.evalScore != null && r.evaluation ? (
                          <span className="inline-flex items-baseline gap-1.5">
                            <span className="tnum text-base font-semibold text-fg">{r.evalScore}</span>
                            <span className="text-2xs text-fg-4">
                              {r.evaluation.checks.filter((x) => x.passed).length}/{r.evaluation.checks.length} checks
                            </span>
                          </span>
                        ) : (
                          <Pending run={runs[c.modelId]} />
                        )}
                      </Cell>
                    );
                  })}
                </Row>
                <Row label="Latency">
                  {columns.map((c) => {
                    const r = runs[c.modelId]?.record;
                    return (
                      <Cell key={c.modelId} c={c} selected={selected} rec={rec?.modelId}>
                        <span className="tnum text-sm text-fg">{formatMs(r?.latencyMs ?? c.latency.totalMs)}</span>
                        <span className="ml-1.5 text-2xs text-fg-4">{r ? (r.latencySource === "measured" ? "measured" : r.latencySource === "recorded" ? "recorded run" : "estimated") : "estimate"}</span>
                      </Cell>
                    );
                  })}
                </Row>
                <Row label="External API cost">
                  {columns.map((c) => {
                    const r = runs[c.modelId]?.record;
                    return (
                      <Cell key={c.modelId} c={c} selected={selected} rec={rec?.modelId}>
                        {c.location === "local" ? (
                          <span className="tnum text-sm font-medium text-local-fg">$0.00</span>
                        ) : r && r.mode === "live" ? (
                          <span className="tnum text-sm font-medium text-fg">{formatUsd(r.externalCostUsd)}</span>
                        ) : (
                          <span className="tnum text-sm text-fg-2">
                            {formatUsd(c.cost.costUsd)} <span className="text-2xs text-fg-4">est.</span>
                          </span>
                        )}
                      </Cell>
                    );
                  })}
                </Row>
                <Row label="Tokens in → out">
                  {columns.map((c) => {
                    const r = runs[c.modelId]?.record;
                    return (
                      <Cell key={c.modelId} c={c} selected={selected} rec={rec?.modelId}>
                        <span className="tnum text-xs text-fg-2">
                          {formatTokens(r?.inputTokens ?? c.cost.inputTokens)} → {formatTokens(r?.outputTokens ?? c.cost.outputTokens)}
                        </span>
                        <span className="ml-1.5 text-2xs text-fg-4">{r?.tokenSource === "provider" ? "reported" : "est."}</span>
                      </Cell>
                    );
                  })}
                </Row>
                <Row label="Privacy">
                  {columns.map((c) => (
                    <Cell key={c.modelId} c={c} selected={selected} rec={rec?.modelId}>
                      {c.location === "local" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-local-fg">
                          <HardDrive className="size-3" /> Local
                        </span>
                      ) : (
                        <span className="text-xs text-fg-2">Cloud · external transfer</span>
                      )}
                    </Cell>
                  ))}
                </Row>
                <tr className="align-top">
                  <td className="px-4 py-3 text-xs text-fg-3">Output</td>
                  {columns.map((c) => {
                    const run = runs[c.modelId];
                    const r = run?.record;
                    const on = selected?.has(c.modelId) ?? true;
                    return (
                      <td key={c.modelId} className={cn("border-l border-line px-3 py-3", !on && "opacity-40")}>
                        {run?.state === "estimate" || (!cloudLive && c.location === "cloud" && !isGated(c.status) && !r) ? (
                          <div className="hatch rounded-md border border-warn/30 px-2.5 py-2 text-xs text-fg-2">
                            <div className="mb-1 flex items-center gap-1 font-medium text-warn-fg">
                              <FlaskConical className="size-3" /> Not called (DEMO)
                            </div>
                            No output: cloud is in DEMO mode, so this model is not called. Estimated {formatUsd(c.cost.costUsd)} and ~{formatMs(c.latency.totalMs)} for this task.
                            <div className="mt-1 text-fg-4">{portfolio ? "Real cloud output is available only when the project runs locally with live mode on." : "Enable live mode to compare its real output."}</div>
                          </div>
                        ) : r?.outputText ? (
                          <div className={cn("relative overflow-hidden rounded-md border", r.mode === "demo" ? "hatch border-warn/30" : r.mode === "local" ? "border-local-line" : "border-cloud-line")}>
                            <div className={cn("flex items-center gap-1 px-2 py-1 text-2xs", r.mode === "demo" ? "text-warn-fg" : r.mode === "local" ? "bg-local-soft text-local-fg" : "bg-cloud-soft text-cloud-fg")}>
                              {r.mode === "demo" ? <FlaskConical className="size-3" /> : r.mode === "local" ? <HardDrive className="size-3" /> : <Radio className="size-3" />}
                              {r.mode === "demo"
                                ? recordedReplay(r)
                                  ? "Recorded real output · replayed, not live"
                                  : "Simulated · model not called"
                                : r.mode === "local"
                                  ? "Real output · on-device"
                                  : "Real output · live API"}
                            </div>
                            <div className="scrollbar-thin max-h-[300px] overflow-y-auto bg-surface px-2.5 py-2 [&_.prose-output]:text-xs [&_.prose-output]:leading-[18px]">
                              <Markdown text={r.outputText} />
                            </div>
                          </div>
                        ) : isGated(c.status) ? (
                          <div className="flex items-start gap-1.5 text-xs text-blocked-fg">
                            <Lock className="mt-0.5 size-3 shrink-0" />
                            <span>Not executed. {c.reasons.find((x) => x.severity === "block")?.message}</span>
                          </div>
                        ) : (
                          <Pending run={run} empty="Run the comparison to see output" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {scenario ? <p className="text-xs text-fg-4">Scenario {scenario.number}: {scenario.lesson}</p> : null}
      {portfolio ? (
        <p className="text-xs text-fg-4">
          Portfolio demo: no model is called from this site. Local columns replay outputs recorded from real Gemma 4 12B and Qwen 3.5 9B runs on the
          developer&apos;s Mac when one exists for this exact task; cloud columns show the router&apos;s estimates only.
        </p>
      ) : status && !status.config.cloudLive ? (
        <p className="text-xs text-fg-4">
          Cloud models are not called because live mode is off; their columns show the router&apos;s estimates. Set <code className="font-mono">AI_LIVE_MODE=true</code>, <code className="font-mono">DEFAULT_PROVIDER=live</code> and an API key to compare real cloud outputs; each paid
          call reserves its worst-case cost first and identical requests are served from cache.
        </p>
      ) : null}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <tr className="border-b border-line">
      <td className="px-4 py-2.5 align-middle text-xs text-fg-3">
        {hint ? (
          <Tip content={hint}>
            <span className="cursor-help underline decoration-dotted decoration-fg-4 underline-offset-2">{label}</span>
          </Tip>
        ) : (
          label
        )}
      </td>
      {children}
    </tr>
  );
}

function Cell({ c, selected, rec, children }: { c: CandidateEvaluation; selected: Set<string> | null; rec?: string | null; children: ReactNode }) {
  const on = selected?.has(c.modelId) ?? true;
  const isRec = rec === c.modelId;
  return <td className={cn("border-l border-line px-3 py-2.5 align-middle", !on && "opacity-40", isRec && (c.location === "local" ? "bg-local-soft" : "bg-cloud-soft"))}>{children}</td>;
}

function ExecCell({ c, run, cloudLive, portfolio }: { c: CandidateEvaluation; run?: RunState; cloudLive: boolean; portfolio: boolean }) {
  if (isGated(c.status)) return <span className="text-xs text-fg-4">Not executed</span>;
  if (run?.state === "estimate" || (!cloudLive && c.location === "cloud"))
    return (
      <span className="inline-flex items-center gap-1 text-xs text-warn-fg">
        <FlaskConical className="size-3" /> Not called · DEMO
      </span>
    );
  if (run?.record && run.state === "done")
    return (
      <span className="inline-flex items-center gap-1.5">
        <ModeBadge mode={run.record.mode} size="xs" />
        {run.record.mode === "demo" && recordedReplay(run.record) ? <span className="text-2xs text-fg-3">recorded</span> : null}
      </span>
    );
  if (run?.state === "error") return <span className="text-xs text-danger-fg">{run.error}</span>;
  if (run?.state === "running") return <Pending run={run} />;
  return (
    <span className="text-xs text-fg-4">
      {c.location === "local" ? (portfolio ? "Will simulate (recorded where available)" : "Will run locally") : cloudLive ? "Will call live API" : "Will simulate (DEMO)"}
    </span>
  );
}

function Pending({ run, empty = "—" }: { run?: RunState; empty?: string }) {
  if (run?.state === "running")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-fg-2">
        <Loader2 className="size-3 animate-spin" /> running
      </span>
    );
  if (run?.state === "queued") return <span className="text-xs text-fg-4">queued</span>;
  return <span className="text-xs text-fg-4">{empty}</span>;
}

function RecommendationCard({ rec, decision }: { rec: NonNullable<ReturnType<typeof recommend>>; decision: RoutingDecision }) {
  const c = decision.candidates.find((x) => x.modelId === rec.modelId);
  if (!c) return null;
  const local = c.location === "local";
  return (
    <div className={cn("flex animate-rise flex-wrap items-start gap-4 rounded-lg border px-4 py-3.5", local ? "border-local-line bg-local-soft" : "border-cloud-line bg-cloud-soft")}>
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md text-white", local ? "bg-local" : "bg-cloud")}>
        <Award className="size-4" />
      </span>
      <div className="min-w-[220px]">
        <SectionLabel>Recommended among measured runs</SectionLabel>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-[16px] font-semibold text-fg">{c.displayName}</span>
          <LocationChip location={c.location} />
        </div>
        <div className="mt-1 text-xs text-fg-3">
          Ranked on measured results · {rec.ranked.length} run{rec.ranked.length === 1 ? "" : "s"} · {PRIORITY_LABEL[decision.priorityMode]}
        </div>
      </div>
      <ul className="min-w-[280px] flex-1 space-y-1 text-sm text-fg-2">
        {rec.reasons.map((r, i) => (
          <li key={i} className="flex gap-2">
            {r.includes("Not called") ? <TriangleAlert className="mt-[3px] size-3.5 shrink-0 text-warn-fg" /> : <span className="mt-[9px] size-1 shrink-0 rounded-full bg-fg-3" />}
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
