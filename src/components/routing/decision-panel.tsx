import { ArrowRight, Check, CircleAlert, Info, Layers, ShieldBan, UserRoundCheck } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { COMPLEXITY_LABEL, taskTypeLabel } from "@/core/classification/classify";
import { PRIORITY_LABEL } from "@/core/routing/config";
import type { RoutingDecision } from "@/core/types";
import type { ExecutionRecord } from "@/services/observability/types";
import { ClassificationChip, DESTINATION_ICON, DestinationBadge } from "@/components/ui/badges";
import { Disclosure } from "@/components/ui/disclosure";
import { Tip } from "@/components/ui/primitives";
import { cn, formatMs, formatTokens, formatUsd, PROVIDER_NAME } from "@/lib/format";
import { CLASSIFICATION_META, reviewOf, routeOf, selectedOf, sentenceCase, whyOf, type WhyItem } from "@/lib/routing-view";
import { CandidateList, Rationale } from "./candidates";

const chip = "inline-flex h-6 items-center rounded-md border border-line-strong bg-surface-2 px-2 text-xs font-medium text-fg-2";

/** What the router knows about the request, as quiet metadata. */
export function ProfileChips({ decision }: { decision: RoutingDecision }) {
  const p = decision.profile;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ClassificationChip value={p.classification} />
      <span className={chip}>{taskTypeLabel(p.taskType)}</span>
      <span className={chip}>{sentenceCase(COMPLEXITY_LABEL[p.complexity])} complexity</span>
      <span className={chip}>~{formatTokens(p.estimatedInputTokens)} tokens</span>
      <span className={chip}>{PRIORITY_LABEL[decision.priorityMode]}</span>
    </div>
  );
}

function outcomeLine(d: RoutingDecision): string {
  const sel = selectedOf(d);
  const cls = CLASSIFICATION_META[d.profile.classification].label;
  const sensitive = d.profile.classification === "confidential" || d.profile.classification === "restricted";
  if (!sel) {
    if (d.block?.code === "local_required_unavailable")
      return `${cls} data required local execution, but no approved local model was available. Nothing was sent externally.`;
    if (d.block?.code === "budget_exhausted") return "The session budget can't cover any capable cloud model and no local model can take it. Nothing ran and nothing was spent.";
    return "No model satisfies policy, availability and capability for this request. Nothing ran.";
  }
  if (d.budgetGuard?.triggered) return "Budget Guard removed the expensive route. A capable local model takes the request instead.";
  if (!d.qualityThresholdMet) return "No model fully clears the quality bar. The best available runs, and a person reviews the output.";
  if (sel.location === "local") return sensitive ? `Runs on-device. ${cls} data never leaves the machine.` : "Runs on-device at $0 in external API cost.";
  return `Runs on ${PROVIDER_NAME[sel.providerId]}: the best value for this task in ${PRIORITY_LABEL[d.priorityMode]} mode.`;
}

/** The answer, stated plainly. Blocked is presented as a protected outcome, not an error. */
export function OutcomeCard({ decision, record, className }: { decision: RoutingDecision; record?: Pick<ExecutionRecord, "review" | "status"> | null; className?: string }) {
  const sel = selectedOf(decision);
  const route = routeOf(decision);
  const review = reviewOf(decision, record);
  const guard = decision.budgetGuard?.triggered ? decision.budgetGuard : null;
  const original = guard ? decision.candidates.find((c) => c.modelId === guard.originalModelId) : null;
  return (
    <div className={cn("card card-glow overflow-hidden p-6 sm:p-7", className)} style={{ "--glow": `var(--${route})` } as CSSProperties}>
      <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full blur-3xl" style={{ background: `color-mix(in srgb, var(--${route}) 22%, transparent)` }} aria-hidden />
      <div className="relative flex items-center gap-2.5">
        <span className="icon-tile size-9 !rounded-xl" style={{ "--tone": `var(--${route})`, "--tone-ink": `var(--${route}-ink)` } as CSSProperties}>
          <RouteIcon route={route} />
        </span>
        <span className="eyebrow">{guard && sel ? "Rerouted by Budget Guard" : "The decision"}</span>
      </div>
      <div className="relative mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        {guard && original && sel ? (
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="font-display text-2xl font-medium text-fg-3 line-through decoration-fg-4">{original.displayName}</span>
            <ArrowRight className="size-5 text-fg-3" aria-label="rerouted to" />
          </span>
        ) : null}
        <h2 className="text-gradient text-4xl font-semibold leading-tight sm:text-5xl">{sel ? sel.displayName : "Request blocked"}</h2>
        <DestinationBadge destination={route} size="md" />
      </div>
      <p className="relative mt-3 max-w-2xl text-md text-fg-2 sm:text-lg">{outcomeLine(decision)}</p>
      {route === "blocked" && decision.block?.code === "local_required_unavailable" ? (
        <p className="mt-1 text-sm text-fg-3">That&apos;s the policy working: the system fails closed rather than leaking restricted data.</p>
      ) : null}

      {sel ? (
        <dl className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Figure label="External cost" value={sel.location === "local" ? "$0.00" : formatUsd(sel.cost.costUsd)} sub={sel.location === "local" ? "local compute" : `worst case ${formatUsd(sel.cost.maxCostUsd)}`} />
          <Figure label="Est. latency" value={formatMs(sel.latency.totalMs)} sub={sel.latency.source === "measured" ? "measured" : "estimated"} />
          <Figure
            label="Quality / bar"
            value={
              <>
                {Math.round(sel.quality.score)}
                <span className="text-fg-3"> / {sel.quality.required}</span>
              </>
            }
            sub={sel.quality.meets ? "clears the bar" : "below the bar"}
          />
          <Figure
            label={
              <Tip content={`Weighted ${PRIORITY_LABEL[decision.priorityMode]} score across privacy, cost, task fit, reasoning and latency. Highest eligible score wins.`}>
                <span className="cursor-help underline decoration-line-strong decoration-dotted underline-offset-4">Value score</span>
              </Tip>
            }
            value={Math.round(sel.routingScore ?? 0)}
            sub={`${PRIORITY_LABEL[decision.priorityMode]} mode`}
          />
        </dl>
      ) : null}

      {review.required ? (
        <div className={cn("relative mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3.5", review.certain ? "border-review-line bg-review-soft shadow-[0_14px_36px_-22px_var(--review)]" : "border-dashed border-review-line")}>
          <span className="icon-tile size-9 !rounded-xl" style={{ "--tone": "var(--review)", "--tone-ink": "var(--review-ink)" } as CSSProperties}>
            <UserRoundCheck className="size-[18px]" strokeWidth={1.9} />
          </span>
          <div className="text-sm">
            <div className="font-medium text-fg">{review.certain ? "Then held for human review" : "May need human review"}</div>
            <div className="text-fg-2">{review.reasons.join(" · ")}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RouteIcon({ route }: { route: ReturnType<typeof routeOf> }) {
  const Icon = DESTINATION_ICON[route];
  return <Icon className="size-[18px]" strokeWidth={1.9} />;
}

function Figure({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface-2/70 px-4 py-3.5">
      <dt className="text-xs font-medium text-fg-3">{label}</dt>
      <dd className="tnum mt-1.5 font-display text-2xl font-semibold text-fg">{value}</dd>
      {sub ? <dd className="text-xs text-fg-3">{sub}</dd> : null}
    </div>
  );
}

const WHY_ICON: Record<WhyItem["tone"], { icon: ReactNode; tone: string }> = {
  pass: { icon: <Check className="size-4" strokeWidth={2.4} />, tone: "brand" },
  info: { icon: <Info className="size-4" strokeWidth={2.2} />, tone: "fg-3" },
  warn: { icon: <CircleAlert className="size-4" strokeWidth={2.2} />, tone: "review" },
  block: { icon: <ShieldBan className="size-4" strokeWidth={2.2} />, tone: "blocked" },
};

/** "Why this route?" in plain language; each line keeps the engine's exact message underneath. */
export function WhyList({ decision, limit = 5, className }: { decision: RoutingDecision; limit?: number; className?: string }) {
  const items = whyOf(decision, limit);
  return (
    <div className={className}>
      <h3 className="text-xl font-semibold text-fg">Why this route?</h3>
      <ul className="mt-4 space-y-4">
        {items.map((i, n) => (
          <li key={`${i.code}-${n}`} className="flex gap-3.5">
            <span
              className="icon-tile mt-0.5 size-8 !rounded-[10px]"
              style={{ "--tone": `var(--${WHY_ICON[i.tone].tone})`, "--tone-ink": WHY_ICON[i.tone].tone === "brand" ? "var(--brand-ink)" : WHY_ICON[i.tone].tone === "fg-3" ? "var(--fg-2)" : `var(--${WHY_ICON[i.tone].tone}-ink)` } as CSSProperties}
              aria-hidden
            >
              {WHY_ICON[i.tone].icon}
            </span>
            <div className="min-w-0">
              <div className="text-md font-medium text-fg">{i.title}</div>
              <div className="text-sm text-fg-3">{i.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The deep layer: every candidate, the full reasoning, the fallback chain and the request profile. */
export function DecisionDetails({ decision, defaultOpen }: { decision: RoutingDecision; defaultOpen?: boolean }) {
  const s = decision.summary;
  const p = decision.profile;
  return (
    <Disclosure
      title="Inspect the decision"
      hint={`${s.considered} models considered · ${s.eligible} eligible · ${s.blockedByPolicy} blocked by policy · ${s.belowThreshold} below the bar${s.unavailable ? ` · ${s.unavailable} unavailable` : ""}`}
      icon={<Layers className="size-[18px]" />}
      defaultOpen={defaultOpen}
    >
      <CandidateList decision={decision} />
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div>
          <div className="eyebrow mb-3">Full reasoning</div>
          <Rationale reasons={decision.rationale} />
        </div>
        <div className="space-y-6">
          <div>
            <div className="eyebrow mb-2">Fallback chain</div>
            {decision.fallbackChain.length ? (
              <p className="text-sm text-fg-2">
                {decision.fallbackChain.map((id) => decision.candidates.find((c) => c.modelId === id)?.shortName ?? id).join(" → ")}
                <span className="block text-fg-3">Only models that already passed governance can be fallbacks.</span>
              </p>
            ) : (
              <p className="text-sm text-fg-3">{decision.outcome === "routed" ? "No fallback permitted for this request." : "None: nothing was routed."}</p>
            )}
          </div>
          <div>
            <div className="eyebrow mb-2">Request profile</div>
            <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-fg-3">Task</dt>
              <dd className="text-fg-2">
                {taskTypeLabel(p.taskType)} {p.taskTypeSignals.length ? <span className="text-fg-3">({p.taskTypeSignals.slice(0, 3).join(", ")})</span> : null}
              </dd>
              <dt className="text-fg-3">Complexity</dt>
              <dd className="text-fg-2">
                {COMPLEXITY_LABEL[p.complexity]} <span className="text-fg-3">· score {p.complexityScore}</span>
              </dd>
              <dt className="text-fg-3">Classification</dt>
              <dd className="text-fg-2">
                {CLASSIFICATION_META[p.classification].label} <span className="text-fg-3">· {p.classificationReason}</span>
              </dd>
              <dt className="text-fg-3">Business risk</dt>
              <dd className="capitalize text-fg-2">{p.businessRisk}</dd>
              <dt className="text-fg-3">Policy</dt>
              <dd className="text-fg-2">v{decision.policyVersion}</dd>
            </dl>
          </div>
        </div>
      </div>
    </Disclosure>
  );
}
