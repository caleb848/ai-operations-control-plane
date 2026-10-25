"use client";

import { Award, ChevronDown, Cloud, FlaskConical, HardDrive, Laptop, Lightbulb, Loader2, Lock, Pencil, Play, Radio, ShieldBan, TriangleAlert } from "lucide-react";
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
import { Badge, CandidateStatusBadge, ClassificationChip, DestinationBadge, ModeTag } from "@/components/ui/badges";
import { Markdown } from "@/components/ui/markdown";
import { Button, Skeleton, Tip } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { cn, formatMs, formatTokens, formatUsd, PROVIDER_NAME } from "@/lib/format";
import { SCENARIO_STORY } from "@/lib/routing-view";
import { ValueMap, ValueTakeaways } from "./value-map";

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
  const gatedCount = active.filter((c) => isGated(c.status)).length;

  return (
    <div className="space-y-8">
      <section aria-label="Comparison setup" className="card">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4 p-5 sm:p-6">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="compare-task" className="mb-2 block text-sm font-medium text-fg-2">
              Task
            </label>
            <div className="relative">
              <select
                id="compare-task"
                value={scenarioId ?? ""}
                onChange={(e) => pickScenario(e.target.value)}
                className="h-11 w-full appearance-none rounded-lg border border-line-strong bg-surface-2 pl-3.5 pr-9 text-md text-fg focus:border-fg-3 focus:outline-none"
              >
                {!scenarioId ? <option value="">Custom task</option> : null}
                {scenarios
                  .filter((s) => !s.simulation)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {SCENARIO_STORY[s.id]?.title ?? s.title}
                    </option>
                  ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3.5 size-4 text-fg-3" aria-hidden />
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-medium text-fg-2">Optimize for</div>
            <Segmented ariaLabel="Optimize for" value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: SHORT[p], hint: `${PRIORITY_LABEL[p]}: ${PRIORITY_DESCRIPTION[p]}` }))} />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="lg" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
              <Pencil className="size-4" /> {editing ? "Done" : "Edit task"}
            </Button>
            <Button variant={paidCols.length ? "cloud" : "primary"} size="lg" disabled={!decision || busy || !runnable.length} onClick={runAll}>
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
          <div className="grid grid-cols-1 gap-4 border-t border-line p-5 sm:p-6 md:grid-cols-2">
            <div>
              <label htmlFor="compare-instruction" className="mb-2 block text-sm font-medium text-fg-2">
                Request
              </label>
              <textarea
                id="compare-instruction"
                value={instruction}
                onChange={(e) => {
                  setInstruction(e.target.value);
                  setScenarioId(null);
                }}
                rows={5}
                className="w-full rounded-xl border border-line-strong bg-surface-2 px-4 py-3 text-md text-fg focus:border-fg-3 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="compare-context" className="mb-2 block text-sm font-medium text-fg-2">
                Source document <span className="font-normal text-fg-3">(optional)</span>
              </label>
              <textarea
                id="compare-context"
                value={context}
                onChange={(e) => {
                  setContext(e.target.value);
                  setScenarioId(null);
                }}
                rows={5}
                spellCheck={false}
                className="scrollbar-thin w-full rounded-xl border border-line-strong bg-surface-2 px-4 py-3 font-mono text-[13px] leading-[21px] text-fg-2 focus:border-fg-3 focus:outline-none"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-5 py-4 sm:px-6">
            <p className="min-w-0 flex-1 text-md text-fg">{instruction}</p>
            {decision ? <ClassificationChip value={decision.profile.classification} /> : null}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line px-5 py-3 text-sm text-fg-3 sm:px-6">
          <span className="inline-flex items-center gap-1.5">
            <Laptop className="size-4" aria-hidden />
            {portfolio
              ? `${localCount} local: simulated, replaying recorded runs where they exist`
              : `${localCount} local run${localCount === 1 ? "" : "s"}, real, about ${formatMs(estLocalMs)} in sequence`}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Cloud className="size-4" aria-hidden />
            {cloudLive ? `${paidCols.length} cloud live, worst case ${formatUsd(worstCase)}` : `${estimateOnly.length} cloud: not called, estimates only`}
          </span>
          {gatedCount ? (
            <span className="inline-flex items-center gap-1.5 text-blocked-ink">
              <ShieldBan className="size-4" aria-hidden /> {gatedCount} not allowed or unavailable
            </span>
          ) : null}
          <span className="lg:ml-auto">Policy applies here too: a blocked model is never called.</span>
        </div>
      </section>

      {decision ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <section aria-labelledby="value-title" className="card card-glow overflow-hidden p-5 sm:p-8">
            <div className="mb-6">
              <h2 id="value-title" className="text-xl font-semibold text-fg">
                Value map
              </h2>
              <p className="mt-1 text-sm text-fg-3">Where each model lands on quality and cost for this task, before anything runs. The ringed dot is the router&apos;s pick.</p>
            </div>
            <ValueMap decision={decision} recommendedId={rec?.modelId} />
          </section>
          <ValueTakeaways decision={decision} />
        </div>
      ) : (
        <Skeleton className="h-[440px] w-full rounded-2xl" />
      )}

      {rec && rec.modelId && decision ? <RecommendationCard rec={rec} decision={decision} /> : null}
      {rec && !rec.modelId && !busy ? (
        <p className="flex items-start gap-2.5 rounded-xl border border-dashed border-line-strong px-4 py-3 text-md text-fg-2">
          <FlaskConical className="mt-1 size-4 shrink-0 text-fg-3" aria-hidden />
          <span>
            <span className="font-medium text-fg">No recommendation for this run.</span> Only real or recorded output can be recommended, and these outputs were
            simulated. The routing scores and estimates above still apply.
          </span>
        </p>
      ) : null}

      <section aria-labelledby="side-title" className="card overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pb-4 pt-6 sm:px-6">
          <h2 id="side-title" className="text-xl font-semibold text-fg">
            Side by side
          </h2>
          <span className="text-sm text-fg-3">Untick a model to leave it out of the run.</span>
        </div>
        {!decision ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="scrollbar-thin overflow-x-auto border-t border-line" tabIndex={0} aria-label="Model comparison table">
            <table className="w-full min-w-[960px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[164px]" />
                {columns.map((c) => (
                  <col key={c.modelId} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-line align-top">
                  <th scope="col" className="sticky left-0 z-10 bg-surface px-5 py-4 text-left text-sm font-normal text-fg-3 sm:px-6">
                    Model
                  </th>
                  {columns.map((c) => {
                    const on = selected?.has(c.modelId) ?? true;
                    const isRec = rec?.modelId === c.modelId;
                    const isPick = decision.selectedModelId === c.modelId;
                    return (
                      <th scope="col" key={c.modelId} className={cn("border-l border-line px-4 py-4 text-left font-normal", !on && "opacity-45", isRec && "bg-surface-2")}>
                        <label className="flex cursor-pointer items-start gap-2.5">
                          <input
                            type="checkbox"
                            className="mt-1 size-4 accent-[var(--fg)]"
                            checked={on}
                            aria-label={`Include ${c.displayName}`}
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
                            <span className="flex items-center gap-2.5">
                              <span className="icon-tile size-8 !rounded-[10px] font-display text-sm font-bold" style={{ "--tone": `var(--${c.location})`, "--tone-ink": `var(--${c.location}-ink)` } as React.CSSProperties}>
                                {c.shortName.charAt(0)}
                              </span>
                              <span className="block truncate text-md font-semibold text-fg">{c.shortName}</span>
                            </span>
                            <span className="mt-1.5 flex flex-wrap gap-1.5">
                              <DestinationBadge destination={c.location} size="xs" />
                              {isPick ? <Badge size="xs">Router&apos;s pick</Badge> : null}
                              {isRec ? (
                                <Badge size="xs">
                                  <Award /> Recommended
                                </Badge>
                              ) : null}
                            </span>
                          </span>
                        </label>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <Row label="Eligibility" hint="Policy, availability and budget gates first; then only models that clear the quality bar compete, unless none do">
                  {columns.map((c) => (
                    <Cell key={c.modelId} c={c} selected={selected} rec={rec?.modelId}>
                      {isGated(c.status) ? (
                        <Tip content={c.reasons.find((r) => r.severity === "block")?.message ?? ""}>
                          <span>
                            <CandidateStatusBadge status={c.status} location={c.location} />
                          </span>
                        </Tip>
                      ) : c.status === "below_threshold" ? (
                        <span className="text-review-ink">Below the quality bar</span>
                      ) : (
                        <span className="text-fg-2">Eligible</span>
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
                <Row label="Routing score" hint="The router's weighted score for this priority, before execution. The highest-scoring eligible model wins.">
                  {columns.map((c) => (
                    <Cell key={c.modelId} c={c} selected={selected} rec={rec?.modelId}>
                      <span className="tnum text-lg font-semibold text-fg">{c.routingScore != null ? Math.round(c.routingScore) : "—"}</span>
                    </Cell>
                  ))}
                </Row>
                <Row label="Quality / bar" hint="Capability profile for this task against the quality it requires">
                  {columns.map((c) => (
                    <Cell key={c.modelId} c={c} selected={selected} rec={rec?.modelId}>
                      <span className="tnum text-fg">{Math.round(c.quality.score)}</span>
                      <span className="tnum text-fg-3"> / {c.quality.required}</span>
                      <span className={cn("ml-2 text-sm", c.quality.meets ? "text-fg-3" : "text-review-ink")}>{c.quality.meets ? "clears" : "below"}</span>
                    </Cell>
                  ))}
                </Row>
                <Row label="Evaluation" hint="Heuristic checks on the actual output">
                  {columns.map((c) => {
                    const r = runs[c.modelId]?.record;
                    return (
                      <Cell key={c.modelId} c={c} selected={selected} rec={rec?.modelId}>
                        {runs[c.modelId]?.state === "estimate" || (!cloudLive && c.location === "cloud" && !isGated(c.status)) ? (
                          <span className="text-fg-3">Not called</span>
                        ) : r && r.evalScore == null ? (
                          <span className="text-fg-3">Simulated text</span>
                        ) : r?.evalScore != null && r.evaluation ? (
                          <span className="inline-flex items-baseline gap-1.5">
                            <span className="tnum text-lg font-semibold text-fg">{r.evalScore}</span>
                            <span className="text-sm text-fg-3">
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
                        <span className="tnum text-fg">{formatMs(r?.latencyMs ?? c.latency.totalMs)}</span>
                        <span className="ml-1.5 text-sm text-fg-3">{r ? (r.latencySource === "measured" ? "measured" : r.latencySource === "recorded" ? "recorded run" : "estimated") : "estimate"}</span>
                      </Cell>
                    );
                  })}
                </Row>
                <Row label="API cost">
                  {columns.map((c) => {
                    const r = runs[c.modelId]?.record;
                    return (
                      <Cell key={c.modelId} c={c} selected={selected} rec={rec?.modelId}>
                        {c.location === "local" ? (
                          <span className="tnum font-medium text-fg">$0.00</span>
                        ) : r && r.mode === "live" ? (
                          <span className="tnum font-medium text-fg">{formatUsd(r.externalCostUsd)}</span>
                        ) : (
                          <span className="tnum text-fg">
                            {formatUsd(c.cost.costUsd)} <span className="text-sm text-fg-3">est.</span>
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
                        <span className="tnum text-fg-2">
                          {formatTokens(r?.inputTokens ?? c.cost.inputTokens)} → {formatTokens(r?.outputTokens ?? c.cost.outputTokens)}
                        </span>
                        <span className="ml-1.5 text-sm text-fg-3">{r?.tokenSource === "provider" ? "reported" : "est."}</span>
                      </Cell>
                    );
                  })}
                </Row>
                <Row label="Data goes to">
                  {columns.map((c) => (
                    <Cell key={c.modelId} c={c} selected={selected} rec={rec?.modelId}>
                      <span className="text-fg-2">{c.location === "local" ? (portfolio ? "Developer's Mac (reference)" : "Stays on this device") : `${PROVIDER_NAME[c.providerId]} API`}</span>
                    </Cell>
                  ))}
                </Row>
                <tr className="align-top">
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-5 py-4 text-left text-sm font-normal text-fg-3 sm:px-6">
                    Output
                  </th>
                  {columns.map((c) => {
                    const run = runs[c.modelId];
                    const r = run?.record;
                    const on = selected?.has(c.modelId) ?? true;
                    return (
                      <td key={c.modelId} className={cn("border-l border-line px-4 py-4", !on && "opacity-45", rec?.modelId === c.modelId && "bg-surface-2")}>
                        {run?.state === "estimate" || (!cloudLive && c.location === "cloud" && !isGated(c.status) && !r) ? (
                          <div className="rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-sm text-fg-3">
                            <div className="mb-1 flex items-center gap-1.5 font-medium text-fg-2">
                              <FlaskConical className="size-3.5" aria-hidden /> Not called
                            </div>
                            Estimated {formatUsd(c.cost.costUsd)} and about {formatMs(c.latency.totalMs)} for this task.{" "}
                            {portfolio ? "Real cloud output needs a local install with live mode on." : "Turn on live mode to compare its real output."}
                          </div>
                        ) : r?.outputText ? (
                          <div className="overflow-hidden rounded-lg border border-line">
                            <div className="flex items-center gap-1.5 border-b border-line bg-surface-2/60 px-3 py-1.5 text-xs text-fg-2">
                              {r.mode === "demo" ? <FlaskConical className="size-3.5" aria-hidden /> : r.mode === "local" ? <HardDrive className="size-3.5" aria-hidden /> : <Radio className="size-3.5" aria-hidden />}
                              {r.mode === "demo" ? (recordedReplay(r) ? "Recorded real output, replayed" : "Simulated, model not called") : r.mode === "local" ? "Real output, on-device" : "Real output, live API"}
                            </div>
                            <div className="scrollbar-thin max-h-[320px] overflow-y-auto px-3 py-2.5 [&_.prose-output]:text-[13px] [&_.prose-output]:leading-5" tabIndex={0} aria-label={`${c.shortName} output`}>
                              <Markdown text={r.outputText} />
                            </div>
                          </div>
                        ) : isGated(c.status) ? (
                          <div className="flex items-start gap-1.5 text-sm text-blocked-ink">
                            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                            <span>Not run. {c.reasons.find((x) => x.severity === "block")?.message}</span>
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
      </section>
      {scenario ? (
        <p className="flex items-start gap-2 text-sm text-fg-3">
          <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="font-medium text-fg-2">{(SCENARIO_STORY[scenario.id]?.title ?? scenario.title).replace(/\.$/, "")}.</span> {scenario.lesson}
          </span>
        </p>
      ) : null}
      {portfolio ? (
        <p className="text-sm text-fg-3">
          No model is called from this site. Local columns replay outputs recorded from real Gemma 4 12B and Qwen 3.5 9B runs on the developer&apos;s Mac when one exists for
          this exact task; cloud columns show the router&apos;s estimates only.
        </p>
      ) : status && !status.config.cloudLive ? (
        <p className="text-sm text-fg-3">
          Cloud models are not called because live mode is off; their columns show the router&apos;s estimates. Set <code className="font-mono text-[13px]">AI_LIVE_MODE=true</code>,{" "}
          <code className="font-mono text-[13px]">DEFAULT_PROVIDER=live</code> and an API key to compare real cloud outputs; each paid call reserves its worst-case cost first and
          identical requests are served from cache.
        </p>
      ) : null}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <tr className="border-b border-line">
      <th scope="row" className="sticky left-0 z-10 bg-surface px-5 py-3 text-left align-middle text-sm font-normal text-fg-3 sm:px-6">
        {hint ? (
          <Tip content={hint}>
            <span className="cursor-help underline decoration-line-strong decoration-dotted underline-offset-4">{label}</span>
          </Tip>
        ) : (
          label
        )}
      </th>
      {children}
    </tr>
  );
}

function Cell({ c, selected, rec, children }: { c: CandidateEvaluation; selected: Set<string> | null; rec?: string | null; children: ReactNode }) {
  const on = selected?.has(c.modelId) ?? true;
  return <td className={cn("border-l border-line px-4 py-3 align-middle", !on && "opacity-45", rec === c.modelId && "bg-surface-2")}>{children}</td>;
}

function ExecCell({ c, run, cloudLive, portfolio }: { c: CandidateEvaluation; run?: RunState; cloudLive: boolean; portfolio: boolean }) {
  if (isGated(c.status)) return <span className="text-fg-3">Not run</span>;
  if (run?.state === "estimate" || (!cloudLive && c.location === "cloud"))
    return (
      <span className="inline-flex items-center gap-1.5 text-fg-3">
        <FlaskConical className="size-3.5" aria-hidden /> Estimates only
      </span>
    );
  if (run?.record && run.state === "done") return <ModeTag mode={run.record.mode === "demo" && recordedReplay(run.record) ? "recorded" : run.record.mode} size="xs" />;
  if (run?.state === "error") return <span className="text-danger-ink">{run.error}</span>;
  if (run?.state === "running") return <Pending run={run} />;
  return <span className="text-fg-3">{c.location === "local" ? (portfolio ? "Simulated, recorded where possible" : "Runs locally") : cloudLive ? "Calls the live API" : "Simulated"}</span>;
}

function Pending({ run, empty = "—" }: { run?: RunState; empty?: string }) {
  if (run?.state === "running")
    return (
      <span className="inline-flex items-center gap-1.5 text-fg-2">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Running
      </span>
    );
  if (run?.state === "queued") return <span className="text-fg-3">Queued</span>;
  return <span className="text-fg-3">{empty}</span>;
}

function RecommendationCard({ rec, decision }: { rec: NonNullable<ReturnType<typeof recommend>>; decision: RoutingDecision }) {
  const c = decision.candidates.find((x) => x.modelId === rec.modelId);
  if (!c) return null;
  return (
    <section aria-labelledby="rec-title" className="card animate-rise p-6 sm:p-8">
      <div className="flex flex-wrap items-start gap-x-10 gap-y-5">
        <div className="min-w-[240px]">
          <div className="eyebrow flex items-center gap-1.5">
            <Award className="size-3.5" aria-hidden /> Recommended from measured runs
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 id="rec-title" className="text-3xl font-semibold text-fg">
              {c.displayName}
            </h2>
            <DestinationBadge destination={c.location} size="md" />
          </div>
          <p className="mt-1.5 text-sm text-fg-3">
            Ranked on {rec.ranked.length} run{rec.ranked.length === 1 ? "" : "s"} in {PRIORITY_LABEL[decision.priorityMode]} mode
          </p>
        </div>
        <ul className="min-w-[280px] flex-1 space-y-2 text-md text-fg-2">
          {rec.reasons.map((r, i) => (
            <li key={i} className="flex gap-2.5">
              {r.includes("Not called") ? <TriangleAlert className="mt-1 size-4 shrink-0 text-review-ink" aria-hidden /> : <span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-fg-3" aria-hidden />}
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
