"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/format";

export interface Series {
  key: string;
  label: string;
  color: string;
}

export function Legend({ series, className }: { series: Series[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-fg-2", className)}>
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Axis maximum with four even, integer ticks (0, 5, 10, 15, 20 rather than 0, 13, 25, 38, 50). */
function niceMax(v: number): number {
  const raw = Math.max(1, v) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const step = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow);
  return Math.ceil(step) * 4;
}

/**
 * Stacked columns: one column per bucket, segments separated by a 2px surface
 * gap, rounded only at the data end. Each column is a focusable button with
 * its exact values as its name; hover or focus shows a tooltip.
 */
export function StackedColumns({
  data,
  series,
  height = 180,
  label = "Chart",
}: {
  data: { label: string; display?: string; values: Record<string, number> }[];
  series: Series[];
  height?: number;
  label?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = data.map((d) => series.reduce((s, x) => s + (d.values[x.key] ?? 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));

  return (
    <div className="relative" role="group" aria-label={label}>
      <div className="flex">
        <div className="relative w-8 shrink-0" style={{ height }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="tnum absolute right-2.5 -translate-y-1/2 text-xs text-fg-3" style={{ top: height - (t / max) * height }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative flex-1" style={{ height }}>
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 h-px"
              style={{ top: height - (t / max) * height, background: t === 0 ? "var(--axis)" : "repeating-linear-gradient(90deg, var(--grid) 0 6px, transparent 6px 12px)" }}
              aria-hidden
            />
          ))}
          <div className="absolute inset-0 flex items-end justify-around gap-2">
            {data.map((d, i) => {
              const total = totals[i];
              const visible = series.filter((s) => (d.values[s.key] ?? 0) > 0);
              return (
                <button
                  type="button"
                  key={d.label}
                  className="group relative flex h-full flex-1 items-end justify-center rounded-md"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  aria-label={`${d.display ?? d.label}: ${total} in total (${series.map((s) => `${s.label} ${d.values[s.key] ?? 0}`).join(", ")})`}
                >
                  <span className={cn("absolute inset-y-0 left-1/2 w-[calc(100%+8px)] -translate-x-1/2 rounded-2xl transition-colors", hover === i && "bg-surface-2/80")} aria-hidden />
                  <span className="relative flex w-full max-w-11 flex-col-reverse gap-[3px]" style={{ height: `${(total / max) * 100}%` }} aria-hidden>
                    {total > 0 ? (
                      <span className="tnum absolute -top-6 left-1/2 -translate-x-1/2 font-display text-sm font-semibold text-fg-2" aria-hidden>
                        {total}
                      </span>
                    ) : null}
                    {visible.map((s, j) => (
                      <span
                        key={s.key}
                        className="block w-full transition-[opacity,box-shadow] duration-[var(--dur)]"
                        style={{
                          background: `linear-gradient(180deg, color-mix(in srgb, ${s.color} 62%, #fff 38%) 0%, ${s.color} 55%)`,
                          flexGrow: d.values[s.key],
                          flexBasis: 0,
                          minHeight: 3,
                          borderRadius: j === visible.length - 1 ? "10px 10px 4px 4px" : 4,
                          opacity: hover === null || hover === i ? 1 : 0.4,
                          boxShadow: hover === i ? `0 0 18px -2px ${s.color}` : "none",
                        }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          {hover !== null ? (
            <div
              className="pointer-events-none absolute z-10 min-w-44 animate-fade-in rounded-2xl border border-line-strong bg-surface-3/95 px-3.5 py-3 text-sm shadow-[var(--shadow-pop)] backdrop-blur"
              style={{ left: `${((hover + 0.5) / data.length) * 100}%`, top: 4, transform: hover > data.length / 2 ? "translateX(calc(-100% - 16px))" : "translateX(16px)" }}
              aria-hidden
            >
              <div className="mb-1.5 font-medium text-fg">{data[hover].display ?? data[hover].label}</div>
              {series.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-6 text-fg-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: s.color }} />
                    {s.label}
                  </span>
                  <span className="tnum text-fg">{data[hover].values[s.key] ?? 0}</span>
                </div>
              ))}
              <div className="mt-1.5 flex justify-between border-t border-line pt-1.5 text-fg-3">
                <span>Total</span>
                <span className="tnum text-fg">{totals[hover]}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="ml-8 mt-3 flex justify-around gap-2" aria-hidden>
        {data.map((d) => (
          <span key={d.label} className="flex-1 text-center text-xs text-fg-3">
            {d.display ?? d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Part-to-whole on one row with 2px gaps; values labeled beside it, not inside tiny segments. */
export function SplitBar({ parts, height = 8, className }: { parts: { key: string; value: number; color: string; label: string }[]; height?: number; className?: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const visible = parts.filter((p) => p.value > 0);
  return (
    <div className={cn("flex w-full gap-[2px]", className)} style={{ height }} role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
      {visible.map((p, i) => (
        <div
          key={p.key}
          title={`${p.label}: ${p.value}`}
          style={{
            width: `${(p.value / total) * 100}%`,
            background: p.color,
            minWidth: 3,
            borderTopLeftRadius: i === 0 ? height / 2 : 1,
            borderBottomLeftRadius: i === 0 ? height / 2 : 1,
            borderTopRightRadius: i === visible.length - 1 ? height / 2 : 1,
            borderBottomRightRadius: i === visible.length - 1 ? height / 2 : 1,
          }}
        />
      ))}
      {visible.length === 0 ? <div className="w-full rounded-full bg-surface-3" /> : null}
    </div>
  );
}

/** 0–100 factor bar. Muted when the candidate was removed by a hard gate. */
export function FactorBar({ value, color, muted, label, hint }: { value: number; color: string; muted?: boolean; label: string; hint?: ReactNode }) {
  return (
    <div className={cn("grid grid-cols-[76px_1fr_28px] items-center gap-2.5", muted && "opacity-50")} title={typeof hint === "string" ? hint : undefined}>
      <span className="truncate text-sm text-fg-3">{label}</span>
      <div className="relative h-1.5 rounded-full bg-track">
        <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out" style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: muted ? "var(--fg-4)" : color }} />
      </div>
      <span className="tnum text-right text-sm text-fg-2">{Math.round(value)}</span>
    </div>
  );
}

/** Horizontal share bar for tables (one series, one color per row's entity). */
export function ShareBar({ value, max, color, className }: { value: number; max: number; color: string; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-track", className)} aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`, background: color }} />
    </div>
  );
}

/** Budget meter: the fill carries severity (calm below 70%, amber after, red past 90%). */
export function Meter({ value, className, height = 6, label = "Usage" }: { value: number; className?: string; height?: number; label?: string }) {
  const v = Math.max(0, Math.min(1, value));
  const color = v >= 0.9 ? "var(--danger)" : v >= 0.7 ? "var(--review)" : "var(--cloud)";
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-track", className)}
      style={{ height }}
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(v * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${Math.round(v * 100)}% used`}
    >
      <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.max(v > 0 ? 2 : 0, v * 100)}%`, background: color }} />
    </div>
  );
}

export function Sparkline({ values, color = "var(--fg-3)", accent, width = 96, height = 28 }: { values: number[]; color?: string; accent?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={`${d} L${x(last)},${height} L${x(0)},${height} Z`} fill={accent ?? color} opacity={0.1} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last)} cy={y(values[last])} r={2.5} fill={accent ?? color} stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  );
}
