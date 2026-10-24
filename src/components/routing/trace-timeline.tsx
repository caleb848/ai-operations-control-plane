import { Ban, CheckCircle2, CircleAlert, Circle, FlaskConical, XCircle } from "lucide-react";
import type { TraceEvent } from "@/core/types";
import { clockTime, cn } from "@/lib/format";

const LEVEL = {
  info: { icon: Circle, color: "text-fg-4" },
  success: { icon: CheckCircle2, color: "text-ok-fg" },
  warn: { icon: CircleAlert, color: "text-warn-fg" },
  block: { icon: Ban, color: "text-blocked-fg" },
  error: { icon: XCircle, color: "text-danger-fg" },
} as const;

const STAGE_LABEL: Record<TraceEvent["stage"], string> = {
  request: "request",
  classify: "classify",
  governance: "policy",
  availability: "health",
  routing: "route",
  budget: "budget",
  execution: "execute",
  fallback: "fallback",
  evaluation: "eval",
  review: "review",
  complete: "done",
};

/** Request trace: wall-clock time, offset from start, stage, and what happened. */
export function TraceTimeline({ events, live }: { events: TraceEvent[]; live?: boolean }) {
  return (
    <ol className="relative font-mono text-xs">
      {events.map((e, i) => {
        const L = LEVEL[e.level];
        const Icon = L.icon;
        return (
          <li key={i} className="group relative grid grid-cols-[64px_52px_16px_1fr] items-start gap-x-2 py-[5px] animate-rise" style={{ animationDelay: live ? `${Math.min(i, 24) * 18}ms` : undefined }}>
            <span className="tnum text-fg-3">{clockTime(e.at)}</span>
            <span className="tnum text-right text-fg-4">+{(e.offsetMs / 1000).toFixed(e.offsetMs < 10_000 ? 2 : 1)}s</span>
            <span className={cn("relative z-10 mt-[1px] flex size-4 items-center justify-center bg-surface", L.color)}>
              <Icon className="size-3.5" strokeWidth={2} />
            </span>
            <span className="min-w-0 font-sans">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-2xs uppercase tracking-[0.06em] text-fg-4">{STAGE_LABEL[e.stage]}</span>
                <span className={cn("text-sm", e.level === "block" ? "text-blocked-fg" : e.level === "error" ? "text-danger-fg" : "text-fg")}>{e.message}</span>
                {e.simulated ? (
                  <span className="inline-flex items-center gap-1 rounded border border-warn/30 bg-warn-soft px-1 text-2xs text-warn-fg">
                    <FlaskConical className="size-2.5" /> simulated
                  </span>
                ) : null}
              </span>
              {e.detail ? <span className="mt-0.5 block break-words text-xs text-fg-3">{e.detail}</span> : null}
            </span>
            {i < events.length - 1 ? <span className="absolute bottom-[-6px] left-[131px] top-[22px] w-px bg-line" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}
