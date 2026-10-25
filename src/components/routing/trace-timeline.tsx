import { Ban, CheckCircle2, Circle, CircleAlert, FlaskConical, XCircle } from "lucide-react";
import type { TraceEvent } from "@/core/types";
import { LocalTime } from "@/components/ui/local-time";
import { cn } from "@/lib/format";

const LEVEL = {
  info: { icon: Circle, color: "text-fg-3" },
  success: { icon: CheckCircle2, color: "text-fg-2" },
  warn: { icon: CircleAlert, color: "text-review-ink" },
  block: { icon: Ban, color: "text-blocked-ink" },
  error: { icon: XCircle, color: "text-danger-ink" },
} as const;

const STAGE_LABEL: Record<TraceEvent["stage"], string> = {
  request: "Request",
  classify: "Classify",
  governance: "Policy",
  availability: "Health",
  routing: "Route",
  budget: "Budget",
  execution: "Execute",
  fallback: "Fallback",
  evaluation: "Evaluate",
  review: "Review",
  complete: "Done",
};

/** Decision trace: every step the control plane took, with timing, in order. */
export function TraceTimeline({ events, live }: { events: TraceEvent[]; live?: boolean }) {
  return (
    <ol className="relative">
      {events.map((e, i) => {
        const L = LEVEL[e.level];
        const Icon = L.icon;
        const last = i === events.length - 1;
        return (
          <li
            key={i}
            className={cn("relative grid grid-cols-[18px_minmax(0,1fr)] gap-x-3 pb-4 sm:grid-cols-[76px_18px_minmax(0,1fr)]", live && "animate-rise")}
            style={{ animationDelay: live ? `${Math.min(i, 24) * 16}ms` : undefined }}
          >
            <span className="tnum hidden pt-px text-right font-mono text-xs leading-5 text-fg-3 sm:block">
              <LocalTime iso={e.at} format="clock" />
              <span className="block text-fg-4">+{(e.offsetMs / 1000).toFixed(e.offsetMs < 10_000 ? 2 : 1)}s</span>
            </span>
            <span className="relative flex justify-center">
              <span className={cn("relative z-10 flex size-[18px] items-center justify-center rounded-full bg-surface", L.color)}>
                <Icon className="size-4" strokeWidth={2} aria-hidden />
              </span>
              {!last ? <span className="absolute bottom-[-16px] top-5 w-px bg-line" aria-hidden /> : null}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-fg-3">{STAGE_LABEL[e.stage]}</span>
                <span className={cn("text-sm", e.level === "block" ? "text-blocked-ink" : e.level === "error" ? "text-danger-ink" : "text-fg")}>{e.message}</span>
                {e.simulated ? (
                  <span className="inline-flex h-5 items-center gap-1 rounded-md border border-line-strong bg-surface-2 px-1.5 text-xs text-fg-2">
                    <FlaskConical className="size-3" aria-hidden /> simulated
                  </span>
                ) : null}
              </div>
              {e.detail ? <div className="mt-0.5 break-words text-sm text-fg-3">{e.detail}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
