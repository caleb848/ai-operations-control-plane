"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { RoutingDecision } from "@/core/types";
import type { ExecutionRecord } from "@/services/observability/types";
import { DESTINATION_ICON } from "@/components/ui/badges";
import { cn } from "@/lib/format";
import { DESTINATION, reviewOf, routeOf, routeOfRecord, selectedOf, stagesOf, type Destination, type Route, type Stage, type Tone } from "@/lib/routing-view";

/*
 * The signature visualization: a request travels through the control plane
 * (classification → policy → capability → economics) and resolves into one
 * of four destinations. Motion explains the reasoning: each stage resolves as
 * the packet reaches it, then the chosen route draws in. Budget Guard and
 * provider fallback keep the abandoned route visible, dashed and marked.
 */

type Rec = Pick<ExecutionRecord, "status" | "location" | "fallbackUsed" | "executedModelId" | "review"> & { executedModelName?: string | null };

const STEP_MS = 280;
const FINAL = 6;
const DESTS: Destination[] = ["local", "cloud", "review", "blocked"];

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const m = window.matchMedia(reducedQuery);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(reducedQuery).matches,
    () => false,
  );
}

interface DestView {
  key: Destination;
  state: "chosen" | "secondary" | "maybe" | "attempted" | "excluded" | "idle";
  sub: string;
}

interface FlowModel {
  stages: Stage[];
  route: Route | null;
  attempted: { dest: Route; kind: "budget" | "outage" } | null;
  dests: DestView[];
  summary: string;
  /** The flow played in; the chosen destination gets one settle pulse when it lands. */
  animated?: boolean;
}

function model(d: RoutingDecision, r?: Rec | null): FlowModel {
  const stages = stagesOf(d);
  const planned = routeOf(d);
  const sel = selectedOf(d);
  const review = reviewOf(d, r);
  let route: Route | null = planned;
  let attempted: FlowModel["attempted"] = null;

  if (r) {
    const actual = routeOfRecord(r);
    if (actual === "failed") {
      route = null;
      attempted = { dest: planned, kind: "outage" };
    } else {
      route = actual;
      if (r.fallbackUsed && actual !== planned) attempted = { dest: planned, kind: "outage" };
    }
  }
  const guard = d.budgetGuard?.triggered ? d.budgetGuard : null;
  if (guard && !attempted) attempted = { dest: "cloud", kind: "budget" };

  const local = d.candidates.filter((c) => c.location === "local");
  const cloud = d.candidates.filter((c) => c.location === "cloud");
  const eligible = (cs: typeof local) => cs.filter((c) => c.status === "eligible" || c.status === "selected").length;
  const executedName = r ? (r.executedModelName ?? d.candidates.find((c) => c.modelId === r.executedModelId)?.displayName ?? null) : null;
  const chosenName = executedName ?? sel?.displayName ?? "";

  const dests: DestView[] = DESTS.map((key) => {
    if (key === "review") {
      if (route === "blocked" || route === null) return { key, state: "idle", sub: "Nothing to review" };
      if (review.required)
        return {
          key,
          state: review.certain ? "secondary" : "maybe",
          sub: review.reasons[0] ?? "Required by policy",
        };
      return { key, state: "idle", sub: review.reasons[0] ?? "Not required" };
    }
    if (key === "blocked") {
      if (route === "blocked")
        return {
          key,
          state: "chosen",
          sub: d.block?.code === "budget_exhausted" ? "Budget exhausted" : "Policy enforced, nothing sent",
        };
      return { key, state: "idle", sub: "Not needed" };
    }
    if (route === key) return { key, state: "chosen", sub: chosenName };
    if (attempted?.dest === key)
      return {
        key,
        state: "attempted",
        sub: attempted.kind === "budget" ? "Over budget, rerouted" : "Provider failed, fell back",
      };
    const cs = key === "local" ? local : cloud;
    if (!cs.length) return { key, state: "excluded", sub: "None registered" };
    if (cs.every((c) => c.status === "blocked_policy")) return { key, state: "excluded", sub: "Blocked by policy" };
    if (cs.every((c) => c.status === "unavailable" || c.status === "disabled")) return { key, state: "excluded", sub: "Unavailable" };
    if (cs.every((c) => c.status === "over_budget" || c.status === "blocked_policy" || c.status === "disabled")) return { key, state: "excluded", sub: "Over budget" };
    const n = eligible(cs);
    return {
      key,
      state: "idle",
      sub: n ? `${n} eligible, not chosen` : "Below the quality bar",
    };
  });

  const dest = route ? DESTINATION[route].label : "No destination";
  const parts = stages.slice(1).map((s) => `${s.label}: ${s.value}`);
  const summary = `${route === "blocked" ? "Blocked" : `Routed to ${dest}${chosenName ? ` (${chosenName})` : ""}`}. ${parts.join("; ")}.${review.required && review.certain ? " Human review required." : ""}`;
  return { stages, route, attempted, dests, summary };
}

/** Replays only when the route itself changes: a new plan, or an execution that fell back or failed. */
function signature(d: RoutingDecision, r?: Rec | null): string {
  const diverged = r && (r.fallbackUsed || r.status === "failed") ? `${r.status}:${r.executedModelId}` : "";
  return [d.outcome, d.selectedModelId, d.profile.classification, d.rule.cloudAccess, d.budgetGuard?.triggered ?? "", d.priorityMode, diverged].join("|");
}

/** Plays the stage sequence whenever the route-relevant decision changes; static under reduced motion. */
function useFlowStep(sig: string, animate: boolean): number {
  const reduced = useReducedMotion();
  const [anim, setAnim] = useState({ sig: "", step: 0 });
  useEffect(() => {
    if (!animate || reduced) return;
    const timers = [setTimeout(() => setAnim({ sig, step: 0 }), 0)];
    for (let i = 1; i <= FINAL; i++) timers.push(setTimeout(() => setAnim({ sig, step: i }), 140 + i * STEP_MS));
    return () => timers.forEach(clearTimeout);
  }, [sig, animate, reduced]);
  return !animate || reduced ? FINAL : anim.sig === sig ? anim.step : 0;
}

const TONE_INK: Record<Tone, string> = {
  neutral: "text-fg",
  local: "text-local-ink",
  cloud: "text-cloud-ink",
  review: "text-review-ink",
  blocked: "text-blocked-ink",
};

export function RouteFlow({ decision, record, animate = true, className }: { decision: RoutingDecision; record?: Rec | null; animate?: boolean; className?: string }) {
  const m = useMemo(() => ({ ...model(decision, record), animated: animate }), [decision, record, animate]);
  const step = useFlowStep(signature(decision, record), animate);
  return (
    <div className={cn("@container", className)} role="group" aria-label="Routing decision">
      <p className="sr-only" aria-live="polite">
        {step >= FINAL ? m.summary : ""}
      </p>
      <div className="hidden @[72rem]:block">
        <Wide m={m} step={step} />
      </div>
      <div className="hidden @[46rem]:block @[72rem]:hidden">
        <Medium m={m} step={step} />
      </div>
      <div className="@[46rem]:hidden">
        <Vertical m={m} step={step} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces. The wide and medium layouts are drawn in measured pixels so
// strokes stay crisp and the draw-in is exact.
// ---------------------------------------------------------------------------

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Wraps a pixel-drawn layout: measures the width, renders once it is known. */
function Measured({ height, children }: { height: number; children: (w: number) => React.ReactNode }) {
  const [ref, w] = useWidth();
  return (
    <div ref={ref} className="relative" style={{ height }} aria-hidden>
      {w > 0 ? children(w) : null}
    </div>
  );
}

interface Lit {
  chosenIdx: number;
  attemptedIdx: number;
  attemptColor: "review" | "danger";
  review: DestView;
  reviewLit: boolean;
}

function litOf(m: FlowModel): Lit {
  const chosenIdx = m.route ? DESTS.indexOf(m.route) : -1;
  const review = m.dests[2];
  return {
    chosenIdx,
    attemptedIdx: m.attempted ? DESTS.indexOf(m.attempted.dest) : -1,
    attemptColor: m.attempted?.kind === "budget" ? "review" : "danger",
    review,
    reviewLit: chosenIdx >= 0 && chosenIdx < 2 && (review.state === "secondary" || review.state === "maybe"),
  };
}

function Track({ x0, x1, y, progress }: { x0: number; x1: number; y: number; progress: number }) {
  return (
    <>
      <div className="absolute h-[2px] -translate-y-[0.5px] rounded-full bg-line-strong" style={{ left: x0, width: x1 - x0, top: y }} />
      <div
        className="absolute h-[3px] -translate-y-[1px] rounded-full transition-[width] ease-[var(--ease-in-out)]"
        style={{
          left: x0,
          width: progress - x0,
          top: y,
          background: "linear-gradient(90deg, color-mix(in srgb, var(--brand-2) 45%, transparent), var(--brand-2))",
          boxShadow: "0 0 14px color-mix(in srgb, var(--brand) 80%, transparent)",
          transitionDuration: `${STEP_MS}ms`,
        }}
      />
    </>
  );
}

function Stages({ m, step, xs, y, width }: { m: FlowModel; step: number; xs: number[]; y: number; width: number }) {
  return m.stages.map((s, i) => {
    const resolved = step >= i;
    const x = xs[i];
    return (
      <div key={s.key}>
        <span
          className={cn(
            "absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-[background-color,border-color,box-shadow] duration-[var(--dur)]",
            resolved ? (s.tone === "neutral" ? "border-fg bg-fg shadow-[0_0_0_4px_color-mix(in_srgb,var(--fg)_12%,transparent),0_0_14px_color-mix(in_srgb,var(--fg)_45%,transparent)]" : "") : "border-line-strong bg-bg",
          )}
          style={{
            left: x,
            top: y,
            ...(resolved && s.tone !== "neutral"
              ? {
                  background: `var(--${s.tone})`,
                  borderColor: `var(--${s.tone})`,
                  boxShadow: `0 0 0 4px color-mix(in srgb, var(--${s.tone}) 22%, transparent), 0 0 16px var(--${s.tone})`,
                }
              : {}),
          }}
        />
        <div className={cn("eyebrow absolute transition-colors duration-[var(--dur)]", resolved ? "text-fg-2" : "text-fg-3")} style={{ left: x - 4, top: y - 30 }}>
          {s.label}
        </div>
        <div
          className="absolute transition-[opacity,transform] duration-[var(--dur-slow)] ease-[var(--ease-out)]"
          style={{
            left: x - 4,
            top: y + 16,
            width,
            opacity: resolved ? 1 : 0,
            transform: resolved ? "none" : "translateY(4px)",
          }}
        >
          <div className={cn("text-md font-semibold leading-6", TONE_INK[s.tone])}>{s.value}</div>
          <div className="mt-0.5 line-clamp-2 text-sm leading-5 text-fg-3">{s.sub}</div>
        </div>
      </div>
    );
  });
}

function Junction({ x, y, decided, label }: { x: number; y: number; decided: boolean; label: "center" | "end" | null }) {
  return (
    <>
      <span
        className={cn(
          "absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border transition-[background,box-shadow,border-color] duration-[var(--dur-slow)]",
          decided ? "border-white/40" : "border-line-strong bg-surface-2",
        )}
        style={{
          left: x,
          top: y,
          ...(decided
            ? { background: "radial-gradient(circle at 35% 30%, #c4b5fd, #7357ff 55%, #2a1c96)", boxShadow: "0 0 0 5px color-mix(in srgb, var(--brand) 18%, transparent), 0 0 26px var(--brand)" }
            : {}),
        }}
      >
        <span className={cn("size-2 rounded-full transition-colors", decided ? "bg-white" : "bg-fg-4")} />
      </span>
      {label ? (
        <div
          className={cn("eyebrow absolute", label === "center" ? "-translate-x-1/2" : "-translate-x-full", decided ? "text-fg-2" : "text-fg-3")}
          style={{ left: label === "center" ? x : x + 14, top: y - 36 }}
        >
          Decision
        </div>
      ) : null}
    </>
  );
}

function Packet({ x, y, settled }: { x: number; y: number; settled: boolean }) {
  return (
    <span
      className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_6px_color-mix(in_srgb,var(--brand)_28%,transparent),0_0_22px_var(--brand-2)]"
      style={{
        left: x,
        top: y,
        opacity: settled ? 0 : 1,
        transition: `left ${STEP_MS}ms var(--ease-in-out), opacity 200ms ease`,
      }}
    />
  );
}

function AttemptMark({ x, y, color, show }: { x: number; y: number; color: Lit["attemptColor"]; show: boolean }) {
  return (
    <span
      className="absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-surface transition-opacity duration-[var(--dur)]"
      style={{
        left: x,
        top: y,
        borderColor: `var(--${color})`,
        color: `var(--${color}-ink)`,
        opacity: show ? 1 : 0,
      }}
    >
      <X className="size-3" strokeWidth={3} />
    </span>
  );
}

/** The chosen route: drawn in once the decision lands. */
function DrawPath({ d, color, show, delay = 0, width = 3 }: { d: string; color: string; show: boolean; delay?: number; width?: number }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={`var(--${color})`}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength={1}
      strokeDasharray="1 1"
      style={{
        strokeDashoffset: show ? 0 : 1,
        transition: `stroke-dashoffset 520ms var(--ease-out) ${delay}ms`,
        filter: `drop-shadow(0 0 6px var(--${color}))`,
      }}
    />
  );
}

/** Light pulses that keep travelling the chosen route once it has landed (never under reduced motion). */
function Pulses({ d, color, show, count = 2, dur = 2.4 }: { d: string; color: string; show: boolean; count?: number; dur?: number }) {
  const reduced = useReducedMotion();
  if (!show || reduced) return null;
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <circle key={i} r={3.2} fill="#fff" style={{ filter: `drop-shadow(0 0 6px var(--${color}))` }}>
          <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${(i / count) * dur}s`} path={d} />
        </circle>
      ))}
    </>
  );
}

/** Review happens after the model runs: solid when certain, dashed when only likely. */
function ReviewLink({ d, arrow, review, settled }: { d: string; arrow: string; review: DestView; settled: boolean }) {
  return (
    <g>
      {review.state === "maybe" ? (
        <path
          d={d}
          fill="none"
          stroke="var(--review)"
          strokeWidth={1.75}
          strokeDasharray="4 4"
          style={{
            opacity: settled ? 0.85 : 0,
            transition: "opacity 320ms var(--ease-out) 200ms",
          }}
        />
      ) : (
        <DrawPath d={d} color="review" show={settled} delay={120} width={2} />
      )}
      <path
        d={arrow}
        fill="none"
        stroke="var(--review)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          opacity: settled ? 1 : 0,
          transition: "opacity 200ms ease 480ms",
        }}
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Wide: a track across, then a fan into four stacked destination terminals
// ---------------------------------------------------------------------------

const H = 256;
const ROW = 56;
const GAP = (H - ROW * 4) / 3;
const CY = H / 2;
const TRUNK = 36;
const BRACKET = 30;
const rowY = (i: number) => ROW / 2 + i * (ROW + GAP);

function fanGeometry(w: number) {
  const termW = Math.round(Math.min(320, Math.max(240, w * 0.25)));
  const termX = w - BRACKET - termW;
  const jx = termX - Math.round(Math.min(124, Math.max(96, w * 0.095)));
  const s = (jx - 4) / 5;
  return {
    termW,
    termX,
    jx,
    s,
    stageX: [0, 1, 2, 3, 4].map((i) => 4 + i * s),
    junctionLabel: s >= 128,
  };
}
type FanGeo = ReturnType<typeof fanGeometry>;

/** Leaves the junction on a short shared trunk, then bends into a terminal's lane. */
function fan(g: FanGeo, y: number) {
  const x1 = g.jx + TRUNK;
  const mid = (x1 + g.termX) / 2;
  return `M ${g.jx} ${CY} L ${x1} ${CY} C ${mid} ${CY}, ${mid} ${y}, ${g.termX} ${y}`;
}

/** A bracket on the right: from the chosen terminal down into review. */
function sideBracket(g: FanGeo, ya: number, yb: number) {
  const x0 = g.termX + g.termW;
  const xb = x0 + 16;
  return `M ${x0} ${ya} H ${xb - 8} Q ${xb} ${ya} ${xb} ${ya + 8} V ${yb - 8} Q ${xb} ${yb} ${xb - 8} ${yb} H ${x0 + 2}`;
}

function Wide({ m, step }: { m: FlowModel; step: number }) {
  return <Measured height={H}>{(w) => <WideBody m={m} step={step} g={fanGeometry(w)} />}</Measured>;
}

function WideBody({ m, step, g }: { m: FlowModel; step: number; g: FanGeo }) {
  const decided = step >= 5;
  const settled = step >= FINAL;
  const l = litOf(m);
  const x0 = g.termX + g.termW;
  return (
    <>
      <Track x0={g.stageX[0]} x1={g.jx} y={CY} progress={step >= 5 ? g.jx : g.stageX[Math.min(step, 4)]} />
      <svg className="absolute inset-0 overflow-visible" width="100%" height={H}>
        {DESTS.map((k, i) => (
          <path key={k} d={fan(g, rowY(i))} fill="none" stroke="var(--line-strong)" strokeWidth={1} />
        ))}
        {l.attemptedIdx >= 0 ? (
          <path
            d={fan(g, rowY(l.attemptedIdx))}
            fill="none"
            stroke={`var(--${l.attemptColor})`}
            strokeWidth={1.75}
            strokeDasharray="4 5"
            style={{
              opacity: decided ? 1 : 0,
              transition: "opacity 200ms ease",
            }}
          />
        ) : null}
        {l.chosenIdx >= 0 ? <DrawPath d={fan(g, rowY(l.chosenIdx))} color={m.route!} show={decided} delay={l.attemptedIdx >= 0 ? 160 : 0} /> : null}
        {l.chosenIdx >= 0 && m.route !== "blocked" ? <Pulses d={fan(g, rowY(l.chosenIdx))} color={m.route!} show={settled} /> : null}
        {l.reviewLit ? (
          <ReviewLink
            d={sideBracket(g, rowY(l.chosenIdx), rowY(2))}
            arrow={`M ${x0 + 8} ${rowY(2) - 4} L ${x0 + 3} ${rowY(2)} L ${x0 + 8} ${rowY(2) + 4}`}
            review={l.review}
            settled={settled}
          />
        ) : null}
      </svg>
      <Stages m={m} step={step} xs={g.stageX} y={CY} width={g.s - 18} />
      <Junction x={g.jx} y={CY} decided={decided} label={g.junctionLabel ? "center" : null} />
      <Packet x={step >= 5 ? g.jx : g.stageX[Math.min(step, 4)]} y={CY} settled={settled} />
      {l.attemptedIdx >= 0 ? <AttemptMark x={(g.jx + TRUNK + g.termX) / 2} y={(CY + rowY(l.attemptedIdx)) / 2} color={l.attemptColor} show={decided} /> : null}
      {m.dests.map((d, i) => (
        <Terminal
          key={d.key}
          d={d}
          lit={settled}
          pulse={m.animated}
          style={{
            left: g.termX,
            width: g.termW,
            top: rowY(i) - ROW / 2,
            height: ROW,
          }}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Medium: the track across the top, then a bus down into four destinations in a row
// ---------------------------------------------------------------------------

const S_TRACK = 30;
const S_BUS = 138;
const S_TERM = 162;
const S_TH = 68;
const S_H = S_TERM + S_TH + 26;

function busGeometry(w: number) {
  const jx = w - 10;
  const s = (jx - 4) / 5;
  const tw = (w - 36) / 4;
  const tx = [0, 1, 2, 3].map((i) => i * (tw + 12));
  return {
    w,
    jx,
    s,
    tw,
    tx,
    cx: tx.map((x) => x + tw / 2),
    stageX: [0, 1, 2, 3, 4].map((i) => 4 + i * s),
    junctionLabel: s >= 160,
  };
}
type BusGeo = ReturnType<typeof busGeometry>;

/** Down from the junction, along the bus, and into one destination. */
function bus(g: BusGeo, i: number) {
  const x = g.cx[i];
  return `M ${g.jx} ${S_TRACK} V ${S_BUS - 10} Q ${g.jx} ${S_BUS} ${g.jx - 10} ${S_BUS} H ${x + 10} Q ${x} ${S_BUS} ${x} ${S_BUS + 10} V ${S_TERM}`;
}

/** Under the row: from the chosen destination across into review. */
function underBracket(g: BusGeo, a: number, b: number) {
  const y0 = S_TERM + S_TH;
  const y1 = y0 + 14;
  return `M ${g.cx[a]} ${y0} V ${y1 - 8} Q ${g.cx[a]} ${y1} ${g.cx[a] + 8} ${y1} H ${g.cx[b] - 8} Q ${g.cx[b]} ${y1} ${g.cx[b]} ${y1 - 8} V ${y0 + 2}`;
}

function Medium({ m, step }: { m: FlowModel; step: number }) {
  return <Measured height={S_H}>{(w) => <MediumBody m={m} step={step} g={busGeometry(w)} />}</Measured>;
}

function MediumBody({ m, step, g }: { m: FlowModel; step: number; g: BusGeo }) {
  const decided = step >= 5;
  const settled = step >= FINAL;
  const l = litOf(m);
  const y0 = S_TERM + S_TH;
  return (
    <>
      <Track x0={g.stageX[0]} x1={g.jx} y={S_TRACK} progress={step >= 5 ? g.jx : g.stageX[Math.min(step, 4)]} />
      <svg className="absolute inset-0 overflow-visible" width="100%" height={S_H}>
        <path d={bus(g, 0)} fill="none" stroke="var(--line-strong)" strokeWidth={1} />
        {[1, 2, 3].map((i) => (
          <path key={i} d={`M ${g.cx[i]} ${S_BUS} V ${S_TERM}`} fill="none" stroke="var(--line-strong)" strokeWidth={1} />
        ))}
        {l.attemptedIdx >= 0 ? (
          <path
            d={bus(g, l.attemptedIdx)}
            fill="none"
            stroke={`var(--${l.attemptColor})`}
            strokeWidth={1.75}
            strokeDasharray="4 5"
            style={{
              opacity: decided ? 1 : 0,
              transition: "opacity 200ms ease",
            }}
          />
        ) : null}
        {l.chosenIdx >= 0 ? <DrawPath d={bus(g, l.chosenIdx)} color={m.route!} show={decided} delay={l.attemptedIdx >= 0 ? 160 : 0} /> : null}
        {l.chosenIdx >= 0 && m.route !== "blocked" ? <Pulses d={bus(g, l.chosenIdx)} color={m.route!} show={settled} /> : null}
        {l.reviewLit ? (
          <ReviewLink
            d={underBracket(g, l.chosenIdx, 2)}
            arrow={`M ${g.cx[2] - 4} ${y0 + 7} L ${g.cx[2]} ${y0 + 2} L ${g.cx[2] + 4} ${y0 + 7}`}
            review={l.review}
            settled={settled}
          />
        ) : null}
      </svg>
      <Stages m={m} step={step} xs={g.stageX} y={S_TRACK} width={g.s - 20} />
      <Junction x={g.jx} y={S_TRACK} decided={decided} label={g.junctionLabel ? "end" : null} />
      <Packet x={step >= 5 ? g.jx : g.stageX[Math.min(step, 4)]} y={S_TRACK} settled={settled} />
      {l.attemptedIdx >= 0 ? <AttemptMark x={g.cx[l.attemptedIdx]} y={(S_BUS + S_TERM) / 2} color={l.attemptColor} show={decided} /> : null}
      {m.dests.map((d, i) => (
        <Terminal key={d.key} d={d} lit={settled} pulse={m.animated} compact wrap style={{ left: g.tx[i], width: g.tw, top: S_TERM, height: S_TH }} />
      ))}
    </>
  );
}

function Terminal({ d, lit, pulse, style, compact, wrap }: { d: DestView; lit: boolean; pulse?: boolean; style?: React.CSSProperties; compact?: boolean; wrap?: boolean }) {
  const Icon = DESTINATION_ICON[d.key];
  const active = lit && (d.state === "chosen" || d.state === "secondary");
  const maybe = lit && d.state === "maybe";
  const attempted = lit && d.state === "attempted";
  const dim = lit && (d.state === "idle" || d.state === "excluded");
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-2xl border transition-[background-color,border-color,box-shadow,opacity] duration-[var(--dur-slow)]",
        style ? "absolute" : "",
        compact ? "px-2.5 py-2" : "px-3",
        active ? "" : maybe ? "border-dashed bg-surface" : dim ? "border-line/70 bg-transparent" : "border-line bg-surface",
        pulse && active && d.state === "chosen" && "animate-settle",
      )}
      style={{
        ...style,
        ["--settle" as string]: `var(--${d.key})`,
        ...(active
          ? {
              background: `linear-gradient(135deg, color-mix(in srgb, var(--${d.key}) 22%, var(--surface)) 0%, var(--surface) 75%)`,
              borderColor: `var(--${d.key}-line)`,
              boxShadow: `0 0 0 1px var(--${d.key}-line), 0 18px 44px -20px var(--${d.key})`,
            }
          : maybe
            ? { borderColor: `var(--${d.key}-line)` }
            : {}),
      }}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center border transition-colors duration-[var(--dur-slow)]",
          compact ? "size-8 rounded-[10px]" : "size-9 rounded-xl",
          active ? "icon-tile" : dim ? "rounded-xl border-line/70 text-fg-4" : "rounded-xl border-line bg-surface-2 text-fg-3",
        )}
        style={
          active
            ? ({ "--tone": `var(--${d.key})`, "--tone-ink": `var(--${d.key}-ink)` } as React.CSSProperties)
            : maybe || attempted
              ? { color: `var(--${d.key}-ink)` }
              : undefined
        }
      >
        <Icon className={compact ? "size-4" : "size-[18px]"} strokeWidth={1.9} />
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate font-semibold", compact ? "text-sm" : "text-base", active ? "text-fg" : dim ? "text-fg-3" : "text-fg-2")}>
          {DESTINATION[d.key].label}
          {d.state === "chosen" && lit ? <span className="sr-only"> (selected)</span> : null}
        </div>
        <div className={cn("text-sm leading-5", wrap ? "line-clamp-2" : "truncate", active ? "text-fg-2" : "text-fg-3", attempted && "line-through decoration-fg-4")}>{d.sub}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vertical: the same story as a timeline, for phones and narrow crops
// ---------------------------------------------------------------------------

function Vertical({ m, step }: { m: FlowModel; step: number }) {
  const decided = step >= 5;
  const settled = step >= FINAL;
  const chosen = m.dests.find((d) => d.state === "chosen");
  return (
    <div aria-hidden>
      <ol>
        {m.stages.map((s, i) => {
          const resolved = step >= i;
          return (
            <li key={s.key} className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-4">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "mt-1.5 size-3.5 shrink-0 rounded-full border-2 transition-[background-color,border-color,box-shadow] duration-[var(--dur)]",
                    resolved ? (s.tone === "neutral" ? "border-fg bg-fg shadow-[0_0_0_4px_color-mix(in_srgb,var(--fg)_12%,transparent),0_0_14px_color-mix(in_srgb,var(--fg)_45%,transparent)]" : "") : "border-line-strong bg-bg",
                  )}
                  style={
                    resolved && s.tone !== "neutral"
                      ? {
                          background: `var(--${s.tone})`,
                          borderColor: `var(--${s.tone})`,
                          boxShadow: `0 0 0 4px color-mix(in srgb, var(--${s.tone}) 22%, transparent), 0 0 16px var(--${s.tone})`,
                        }
                      : undefined
                  }
                />
                <span
                  className="w-[2px] flex-1 rounded-full transition-colors duration-[var(--dur)]"
                  style={step > i ? { background: "linear-gradient(180deg, var(--brand-2), color-mix(in srgb, var(--brand-2) 45%, transparent))", boxShadow: "0 0 10px color-mix(in srgb, var(--brand) 60%, transparent)" } : { background: "var(--line-strong)" }}
                />
              </div>
              <div className="pb-5">
                <div className={cn("eyebrow", resolved ? "text-fg-2" : "text-fg-3")}>{s.label}</div>
                <div
                  className="transition-[opacity,transform] duration-[var(--dur-slow)] ease-[var(--ease-out)]"
                  style={{
                    opacity: resolved ? 1 : 0,
                    transform: resolved ? "none" : "translateY(3px)",
                  }}
                >
                  <div className={cn("mt-0.5 text-md font-semibold", TONE_INK[s.tone])}>{s.value}</div>
                  <div className="text-sm text-fg-3">{s.sub}</div>
                </div>
              </div>
            </li>
          );
        })}
        <li className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-4">
          <div className="flex justify-center">
            <span
              className={cn("mt-0.5 flex size-6 items-center justify-center rounded-full border transition-[background,box-shadow] duration-[var(--dur-slow)]", decided ? "border-white/40" : "border-line-strong bg-surface-2")}
              style={decided ? { background: "radial-gradient(circle at 35% 30%, #c4b5fd, #7357ff 55%, #2a1c96)", boxShadow: "0 0 0 4px color-mix(in srgb, var(--brand) 18%, transparent), 0 0 20px var(--brand)" } : undefined}
            >
              <span className={cn("size-1.5 rounded-full", decided ? "bg-white" : "bg-fg-4")} />
            </span>
          </div>
          <div>
            <div className={cn("eyebrow", decided ? "text-fg-2" : "text-fg-3")}>Decision</div>
            <div className="mt-2 grid grid-cols-1 gap-2 @[30rem]:grid-cols-2">
              {m.dests.map((d) => (
                <Terminal key={d.key} d={d} lit={settled} pulse={m.animated} compact wrap />
              ))}
            </div>
            {settled && chosen && m.attempted ? (
              <p className="mt-2 text-sm text-fg-3">
                {m.attempted.kind === "budget" ? "Budget Guard removed the expensive cloud route." : "The cloud provider failed; a policy-approved fallback took over."}
              </p>
            ) : null}
          </div>
        </li>
      </ol>
    </div>
  );
}
