"use client";

import { Award, Lightbulb } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isRunnable } from "@/core/routing/engine";
import type { CandidateEvaluation, RoutingDecision } from "@/core/types";
import { cn, formatUsd } from "@/lib/format";
import { CANDIDATE_LABEL, selectedOf, valueTakeaways } from "@/lib/routing-view";

/*
 * Value map: every candidate placed by quality (up) and API cost per request
 * (right, log scale), with the task's quality bar drawn across. Local models
 * sit in their own $0 lane. It makes the two economic lessons visible at a
 * glance: free can fall below the bar, and quality far above it is paid for
 * without being needed.
 */

const H = 300;
const LANE = 15;
const GAP = 7;

interface Point {
  c: CandidateEvaluation;
  x: number;
  y: number;
  runnable: boolean;
  /** Label anchor in pixels; the label sits on the named side of its dot. */
  side: "right" | "left" | "above" | "below";
  px: number;
  ly: number;
}

const LABEL_H = 36;

function scales(cs: CandidateEvaluation[], qMin: number) {
  const cloud = cs.filter((c) => c.location === "cloud" && c.cost.costUsd > 0);
  const lo = (cloud.length ? Math.min(...cloud.map((c) => c.cost.costUsd)) : 0.0001) / 2.5;
  const hi = (cloud.length ? Math.max(...cloud.map((c) => c.cost.costUsd)) : 0.01) * 2.5;
  return {
    xOf: (c: CandidateEvaluation) =>
      c.location === "local" || c.cost.costUsd <= 0 ? LANE / 2 : LANE + GAP + (Math.log(c.cost.costUsd / lo) / Math.log(hi / lo)) * (100 - LANE - GAP - 18),
    yOf: (q: number) => (1 - (Math.min(100, q) - qMin) / (100 - qMin)) * H,
  };
}

/** Greedy label placement: right of the dot, else left, above, below; never over another label or dot. */
function layout(cs: CandidateEvaluation[], qMin: number, width: number, pickId?: string): Point[] {
  const { xOf, yOf } = scales(cs, qMin);
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const dots = cs.map((c) => ({ x: (xOf(c) / 100) * width - 8, y: yOf(c.quality.score) - 8, w: 16, h: 16 }));
  const hit = (r: { x: number; y: number; w: number; h: number }) =>
    r.x < 0 || r.x + r.w > width || r.y < -4 || r.y + r.h > H + 4 || [...placed, ...dots].some((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);
  return [...cs]
    .sort((a, b) => b.quality.score - a.quality.score)
    .map((c) => {
      const px = (xOf(c) / 100) * width;
      const py = yOf(c.quality.score);
      const runnable = isRunnable(c.status);
      const meta = runnable ? `Q ${Math.round(c.quality.score)} · ${formatUsd(c.cost.costUsd)}` : CANDIDATE_LABEL[c.status];
      const w = Math.max(c.shortName.length * 8 + (c.modelId === pickId ? 100 : 0) + 18, meta.length * 6.8);
      const tries: { x: number; y: number; side: Point["side"] }[] = [
        { x: px + 12, y: py - 10, side: "right" },
        { x: px - 12 - w, y: py - 10, side: "left" },
        { x: px - w / 2, y: py - 14 - LABEL_H, side: "above" },
        { x: px - w / 2, y: py + 12, side: "below" },
      ];
      const spot = tries.find((t) => !hit({ x: t.x, y: t.y, w, h: LABEL_H })) ?? tries[0];
      placed.push({ x: spot.x, y: spot.y, w, h: LABEL_H });
      return { c, x: xOf(c), y: py, runnable, side: spot.side, px, ly: spot.y };
    });
}

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

function ticks(cs: CandidateEvaluation[]) {
  const cloud = cs.filter((c) => c.location === "cloud" && c.cost.costUsd > 0);
  if (!cloud.length) return [];
  const lo = Math.min(...cloud.map((c) => c.cost.costUsd)) / 2.5;
  const hi = Math.max(...cloud.map((c) => c.cost.costUsd)) * 2.5;
  const out: { v: number; x: number }[] = [];
  for (let p = Math.ceil(Math.log10(lo)); p <= Math.floor(Math.log10(hi)); p++) {
    const v = 10 ** p;
    out.push({ v, x: LANE + GAP + (Math.log(v / lo) / Math.log(hi / lo)) * (100 - LANE - GAP - 18) });
  }
  return out;
}

export function ValueMap({ decision, recommendedId }: { decision: RoutingDecision; recommendedId?: string | null }) {
  const [ref, width] = useWidth();
  const cs = decision.candidates;
  const sel = selectedOf(decision);
  const req = sel?.quality.required ?? cs.find((c) => c.quality.required)?.quality.required ?? 0;
  const qMin = Math.max(0, Math.floor((Math.min(req, ...cs.map((c) => c.quality.score)) - 8) / 10) * 10);
  const pts = width ? layout(cs, qMin, width, sel?.modelId) : [];
  const barY = (1 - (req - qMin) / (100 - qMin)) * H;
  const anyGated = cs.some((c) => !isRunnable(c.status));
  const summary = cs.map((c) => `${c.shortName}: quality ${Math.round(c.quality.score)}, ${c.location === "local" ? "$0" : formatUsd(c.cost.costUsd)}${isRunnable(c.status) ? "" : `, ${CANDIDATE_LABEL[c.status].toLowerCase()}`}`).join("; ");
  return (
    <figure className="m-0">
      <div ref={ref} className="relative ml-9 mr-1" style={{ height: H }} role="img" aria-label={`Quality against API cost. Quality bar ${req}. ${summary}.`}>
        {[qMin, Math.round((qMin + 100) / 2), 100].map((q) => {
          const top = (1 - (q - qMin) / (100 - qMin)) * H;
          return (
            <div key={q} aria-hidden>
              <div className="absolute inset-x-0 h-px bg-[var(--grid)]" style={{ top }} />
              <span className="tnum absolute -left-9 w-7 -translate-y-1/2 text-right text-xs text-fg-3" style={{ top }}>
                {q}
              </span>
            </div>
          );
        })}
        <div className="absolute inset-x-0 top-0 bg-surface-2/50" style={{ height: barY }} aria-hidden />
        <div className="absolute inset-x-0 border-t border-dashed border-fg-3" style={{ top: barY }} aria-hidden />
        <span className="absolute right-0 pt-1 text-xs font-medium text-fg-2" style={{ top: barY }} aria-hidden>
          Quality bar {req}
        </span>
        <div className="absolute inset-y-0 w-px bg-line-strong" style={{ left: `${LANE + GAP / 2}%` }} aria-hidden />

        {pts.map((p) => {
          const isSel = p.c.modelId === sel?.modelId;
          const isRec = recommendedId === p.c.modelId;
          return (
            <div key={p.c.modelId} aria-hidden>
              <span
                className={cn("absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full", !p.runnable && "border-2 border-dashed border-fg-4 bg-surface")}
                style={{
                  left: `${p.x}%`,
                  top: p.y,
                  ...(p.runnable
                    ? {
                        background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--${p.c.location}) 55%, #fff), var(--${p.c.location}))`,
                        boxShadow: isSel
                          ? `0 0 0 4px var(--surface), 0 0 0 6px var(--${p.c.location}), 0 0 28px var(--${p.c.location})`
                          : `0 0 0 5px color-mix(in srgb, var(--${p.c.location}) 18%, transparent), 0 0 16px var(--${p.c.location})`,
                      }
                    : {}),
                }}
              />
              <span
                className={cn("absolute w-max leading-tight", p.side === "left" ? "text-right" : p.side === "right" ? "" : "-translate-x-1/2 text-center")}
                style={p.side === "left" ? { right: width - (p.px - 12), top: p.ly } : { left: p.side === "right" ? p.px + 12 : p.px, top: p.ly }}
              >
                <span className={cn("flex items-center gap-1 whitespace-nowrap text-sm font-medium", p.side === "left" ? "justify-end" : p.side === "right" ? "" : "justify-center", p.runnable ? "text-fg" : "text-fg-3")}>
                  {isRec ? <Award className="size-3.5 text-fg-2" /> : null}
                  {p.c.shortName}
                  {isSel ? <span className="font-normal text-fg-3">· router&apos;s pick</span> : null}
                </span>
                <span className="tnum block whitespace-nowrap text-xs text-fg-3">
                  {p.runnable ? `Q ${Math.round(p.c.quality.score)} · ${p.c.location === "local" ? "$0" : formatUsd(p.c.cost.costUsd)}` : CANDIDATE_LABEL[p.c.status]}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="relative ml-9 mr-1 mt-2 h-5 text-xs text-fg-3" aria-hidden>
        <span className="absolute -translate-x-1/2" style={{ left: `${LANE / 2}%` }}>
          $0 · local
        </span>
        {ticks(cs).map((t) => (
          <span key={t.v} className="tnum absolute -translate-x-1/2" style={{ left: `${t.x}%` }}>
            ${t.v < 0.001 ? t.v.toFixed(4) : t.v < 0.01 ? t.v.toFixed(3) : t.v.toFixed(2)}
          </span>
        ))}
      </div>
      <figcaption className="ml-9 mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-fg-3">
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-local" aria-hidden /> Local AI
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-cloud" aria-hidden /> Cloud AI
        </span>
        {anyGated ? (
          <span className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-full border-2 border-dashed border-fg-4" aria-hidden /> Not allowed or unavailable
          </span>
        ) : null}
        <span className="sm:ml-auto">Up: quality. Right: API cost per request (log scale).</span>
      </figcaption>
    </figure>
  );
}

export function ValueTakeaways({ decision }: { decision: RoutingDecision }) {
  const items = valueTakeaways(decision);
  if (!items.length) return null;
  return (
    <ul className="space-y-4">
      {items.map((t) => (
        <li key={t.title} className="card card-glow spotlight overflow-hidden p-6">
          <div className="flex items-center gap-2.5 text-sm font-medium text-fg-3">
            <span className="icon-tile size-8 !rounded-[10px]">
              <Lightbulb className="size-4" aria-hidden />
            </span>
            Value lesson
          </div>
          <h3 className="mt-3 font-display text-xl font-semibold text-fg">{t.title}</h3>
          <p className="mt-1.5 text-md text-fg-2">{t.body}</p>
        </li>
      ))}
    </ul>
  );
}
