"use client";

import { DESTINATION_ICON } from "@/components/ui/badges";
import { useReducedMotion } from "@/components/charts/viz";
import { formatCount } from "@/lib/format";
import { DESTINATION, type Destination } from "@/lib/routing-view";

/*
 * The week's traffic as a living map. Requests enter the control-plane core
 * and leave for Local AI (left), Cloud AI (right) or Blocked (top); outputs
 * that need a person flow down from Local and Cloud into Human review. Beam
 * width follows volume; light pulses travel the beams (not under reduced
 * motion). The numbers are repeated in text beside the map.
 */

const W = 460;
const H = 440;
const CORE = { x: 230, y: 188 };
const NODE: Record<Destination, { x: number; y: number }> = {
  local: { x: 66, y: 188 },
  cloud: { x: 394, y: 188 },
  blocked: { x: 230, y: 40 },
  review: { x: 230, y: 350 },
};

const LABEL: Record<Destination, "top" | "bottom" | "right"> = { local: "top", cloud: "top", blocked: "right", review: "bottom" };

const BEAMS: { id: string; dest: Destination; d: string; from: Destination | "core" }[] = [
  { id: "local", dest: "local", from: "core", d: `M ${CORE.x - 54} ${CORE.y} C 150 ${CORE.y - 26}, 120 ${CORE.y - 26}, ${NODE.local.x + 32} ${NODE.local.y}` },
  { id: "cloud", dest: "cloud", from: "core", d: `M ${CORE.x + 54} ${CORE.y} C 310 ${CORE.y - 26}, 340 ${CORE.y - 26}, ${NODE.cloud.x - 32} ${NODE.cloud.y}` },
  { id: "blocked", dest: "blocked", from: "core", d: `M ${CORE.x} ${CORE.y - 54} C ${CORE.x + 10} 116, ${CORE.x - 10} 100, ${NODE.blocked.x} ${NODE.blocked.y + 30}` },
  { id: "rev-local", dest: "review", from: "local", d: `M ${NODE.local.x + 6} ${NODE.local.y + 32} C 80 300, 150 ${NODE.review.y}, ${NODE.review.x - 32} ${NODE.review.y}` },
  { id: "rev-cloud", dest: "review", from: "cloud", d: `M ${NODE.cloud.x - 6} ${NODE.cloud.y + 32} C 380 300, 310 ${NODE.review.y}, ${NODE.review.x + 32} ${NODE.review.y}` },
];

export function RouteOrbit({ counts, total }: { counts: Record<Destination, number>; total: number }) {
  const reduced = useReducedMotion();
  const share = (n: number) => (total ? n / total : 0);
  const width = (dest: Destination) => 1.5 + share(counts[dest]) * 7;
  const pulses = (dest: Destination) => (counts[dest] === 0 ? 0 : Math.max(1, Math.round(share(counts[dest]) * 4)));
  const summary = `Last 7 days: ${counts.local} to Local AI, ${counts.cloud} to Cloud AI, ${counts.blocked} blocked, ${counts.review} held for human review, of ${total} requests.`;
  return (
    <div className="relative mx-auto w-full max-w-[520px]" style={{ aspectRatio: `${W} / ${H}` }} role="img" aria-label={summary}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        <defs>
          <radialGradient id="orbit-core" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="45%" stopColor="#7357ff" />
            <stop offset="100%" stopColor="#2a1c96" />
          </radialGradient>
          {BEAMS.map((b) => (
            <linearGradient key={b.id} id={`beam-${b.id}`} gradientUnits="userSpaceOnUse" x1={b.from === "core" ? CORE.x : NODE[b.from as Destination].x} y1={b.from === "core" ? CORE.y : NODE[b.from as Destination].y} x2={NODE[b.dest].x} y2={NODE[b.dest].y}>
              <stop offset="0%" stopColor={b.from === "core" ? "#8b74ff" : `var(--${b.from})`} stopOpacity="0.9" />
              <stop offset="100%" stopColor={`var(--${b.dest})`} stopOpacity="1" />
            </linearGradient>
          ))}
        </defs>

        {/* orbit rings */}
        <g className="origin-center animate-[orbit_80s_linear_infinite]" style={{ transformOrigin: `${CORE.x}px ${CORE.y}px` }}>
          <circle cx={CORE.x} cy={CORE.y} r={150} fill="none" stroke="var(--line-strong)" strokeDasharray="2 7" />
        </g>
        <circle cx={CORE.x} cy={CORE.y} r={104} fill="none" stroke="var(--line)" />

        {/* beams */}
        {BEAMS.map((b) => (
          <g key={b.id}>
            <path d={b.d} fill="none" stroke={`url(#beam-${b.id})`} strokeWidth={b.dest === "review" ? 1.75 : width(b.dest)} strokeLinecap="round" strokeDasharray={b.dest === "review" ? "5 6" : undefined} opacity={0.95} style={{ filter: `drop-shadow(0 0 6px var(--${b.dest}))` }} />
            {!reduced
              ? Array.from({ length: b.dest === "review" ? (counts.review ? 1 : 0) : pulses(b.dest) }).map((_, i, arr) => (
                  <circle key={i} r={b.dest === "review" ? 2.6 : 3.4} fill="#fff" style={{ filter: `drop-shadow(0 0 6px var(--${b.dest}))` }}>
                    <animateMotion dur={`${b.dest === "review" ? 3.6 : 2.6}s`} repeatCount="indefinite" begin={`${(i / arr.length) * (b.dest === "review" ? 3.6 : 2.6)}s`} path={b.d} />
                  </circle>
                ))
              : null}
          </g>
        ))}

        {/* core */}
        <circle cx={CORE.x} cy={CORE.y} r={74} fill="url(#orbit-core)" opacity={0.16} />
        <circle cx={CORE.x} cy={CORE.y} r={54} fill="url(#orbit-core)" style={{ filter: "drop-shadow(0 0 28px rgba(115,87,255,0.75))" }} />
        <circle cx={CORE.x} cy={CORE.y} r={54} fill="none" stroke="rgba(255,255,255,0.35)" />
      </svg>

      {/* core label */}
      <div className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center" style={{ left: `${(CORE.x / W) * 100}%`, top: `${(CORE.y / H) * 100}%` }}>
        <span className="font-display text-3xl font-semibold leading-none text-white">{formatCount(total)}</span>
        <span className="mt-1 text-[11.5px] font-medium uppercase tracking-[0.08em] text-white/85">requests</span>
      </div>

      {/* destination nodes */}
      {(Object.keys(NODE) as Destination[]).map((dest) => {
        const Icon = DESTINATION_ICON[dest];
        const p = NODE[dest];
        const side = LABEL[dest];
        return (
          <div key={dest} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` }}>
            <span className="relative flex size-14 items-center justify-center">
              {!reduced && counts[dest] > 0 ? <span className="absolute inset-0 animate-[ping-soft_3.2s_var(--ease-out)_infinite] rounded-full" style={{ background: `color-mix(in srgb, var(--${dest}) 35%, transparent)` }} aria-hidden /> : null}
              <span
                className="relative flex size-14 items-center justify-center rounded-full border-2 bg-surface"
                style={{ borderColor: `var(--${dest})`, color: `var(--${dest}-ink)`, boxShadow: `0 0 24px -2px color-mix(in srgb, var(--${dest}) 70%, transparent), inset 0 0 18px -6px var(--${dest})` }}
              >
                <Icon className="size-6" strokeWidth={1.9} />
              </span>
            </span>
            <span
              className={`absolute w-max ${side === "right" ? "left-full top-1/2 ml-3 -translate-y-1/2 text-left" : `left-1/2 -translate-x-1/2 text-center ${side === "bottom" ? "top-full mt-2" : "bottom-full mb-2"}`}`}
            >
              <span className="block font-display text-lg font-semibold leading-none text-fg">{formatCount(counts[dest])}</span>
              <span className="mt-1 block text-xs font-medium" style={{ color: `var(--${dest}-ink)` }}>
                {DESTINATION[dest].label}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
