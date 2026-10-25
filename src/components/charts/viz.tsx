"use client";

import { useId, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/format";

/*
 * v3 visual vocabulary: luminous sparklines, radial gauges and the routing
 * orbit. Every mark keeps a text equivalent (accessible name or adjacent
 * numbers); motion is decorative-only and stops under reduced motion.
 */

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const m = window.matchMedia(reducedQuery);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(reducedQuery).matches,
    () => true,
  );
}

const svgId = (raw: string) => `g${raw.replace(/[^a-zA-Z0-9_-]/g, "")}`;

/** Catmull-Rom through the points, as cubic Bézier segments. */
function smooth(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0]} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/** A glowing area sparkline. The series is described by `label` for assistive technology. */
export function AreaSpark({ values, color, height = 56, label, className }: { values: number[]; color: string; height?: number; label: string; className?: string }) {
  const id = svgId(useId());
  const W = 240;
  const max = Math.max(1, ...values);
  const pts: [number, number][] = values.map((v, i) => [Math.round((i / Math.max(1, values.length - 1)) * W), height - 3 - (v / max) * (height - 12)]);
  const line = smooth(pts);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className={cn("block w-full overflow-visible", className)} style={{ height }} role="img" aria-label={label}>
      <defs>
        <linearGradient id={`${id}-f`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.42" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {line ? (
        <>
          <path d={`${line} L ${W} ${height} L 0 ${height} Z`} fill={`url(#${id}-f)`} />
          <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        </>
      ) : null}
    </svg>
  );
}

/** A ring gauge with a gradient arc. Children sit in the middle. */
export function RadialGauge({
  value,
  size = 168,
  stroke = 14,
  from = "var(--brand-from)",
  to = "var(--brand-2)",
  label,
  children,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  from?: string;
  to?: string;
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  const id = svgId(useId());
  const v = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="overflow-visible">
        <defs>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        {v > 0.004 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#${id}-g)`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${Math.max(0.001, c * v)} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ filter: `drop-shadow(0 0 10px color-mix(in srgb, ${from} 70%, transparent))` }}
          />
        ) : null}
      </svg>
      {children ? <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div> : null}
    </div>
  );
}

/** Small ring for inline use (e.g. a share). */
export function MiniRing({ value, color, size = 44, label }: { value: number; color: string; size?: number; label: string }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="shrink-0 overflow-visible">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${Math.max(0.001, c * v)} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ filter: `drop-shadow(0 0 5px ${color})` }}
      />
    </svg>
  );
}

/** A dot matrix that lights up the share, for one proportion at a glance. */
export function DotMeter({
  value,
  color,
  dots = 40,
  rows = 2,
  label,
  className,
}: {
  value: number;
  color: string;
  dots?: number;
  rows?: number;
  label: string;
  className?: string;
}) {
  const lit = Math.round(Math.max(0, Math.min(1, value)) * dots);
  return (
    <div role="img" aria-label={label} className={cn("grid gap-1.5", className)} style={{ gridTemplateColumns: `repeat(${Math.ceil(dots / rows)}, minmax(0, 1fr))` }}>
      {Array.from({ length: dots }).map((_, i) => (
        <span
          key={i}
          className="aspect-square w-full max-w-2.5 rounded-full"
          style={i < lit ? { background: color, boxShadow: `0 0 8px -1px ${color}` } : { background: "var(--track)" }}
          aria-hidden
        />
      ))}
    </div>
  );
}

/** A capability radar: one polygon over N axes (0–100). The values are also listed beside it by callers. */
export function Radar({ values, labels, color, size = 220, label }: { values: number[]; labels: string[]; color: string; size?: number; label: string }) {
  const id = svgId(useId());
  const n = values.length;
  const c = size / 2;
  // Leaves room for the axis labels, so they clear the shape even at scores near 100.
  const R = size / 2 - 40;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [c + Math.cos(a) * R * (v / 100), c + Math.sin(a) * R * (v / 100)] as const;
  };
  const ring = (v: number) => Array.from({ length: n }, (_, i) => pt(i, v).join(",")).join(" ");
  const shape = values.map((v, i) => pt(i, v).join(",")).join(" ");
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="overflow-visible">
      <defs>
        <radialGradient id={`${id}-f`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0.45" />
        </radialGradient>
      </defs>
      {[25, 50, 75, 100].map((v) => (
        <polygon key={v} points={ring(v)} fill="none" stroke="var(--grid)" strokeWidth={v === 100 ? 1.25 : 1} />
      ))}
      {labels.map((_, i) => {
        const [x, y] = pt(i, 100);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--grid)" />;
      })}
      <polygon points={shape} fill={`url(#${id}-f)`} stroke={color} strokeWidth={2} strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
      {values.map((v, i) => {
        const [x, y] = pt(i, v);
        return <circle key={i} cx={x} cy={y} r={3.2} fill="#fff" stroke={color} strokeWidth={2} />;
      })}
      {labels.map((l, i) => {
        const [x, y] = pt(i, 138);
        return (
          <text key={l} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-fg-3 text-[11.5px] font-medium capitalize">
            {l}
          </text>
        );
      })}
    </svg>
  );
}
