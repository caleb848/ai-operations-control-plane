import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ClassificationIcon, DESTINATION_ICON } from "@/components/ui/badges";
import { cn } from "@/lib/format";
import { CLASSIFICATION_META, DESTINATION, SCENARIO_STORY, type Destination } from "@/lib/routing-view";
import type { Scenario } from "@/scenarios/scenarios";

/** Where the scenario's request ends up: one or two stops, each with its destination color and icon. */
export function RouteCue({ id, className }: { id: string; className?: string }) {
  const s = SCENARIO_STORY[id];
  if (!s) return null;
  const stops: Destination[] = s.then ? [s.destination, s.then] : [s.destination];
  return (
    <span className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm", className)}>
      {stops.map((d, i) => {
        const Icon = DESTINATION_ICON[d];
        return (
          <span key={`${d}-${i}`} className="inline-flex items-center gap-1.5">
            {i > 0 ? <ArrowRight className="size-3.5 text-fg-4" aria-label="then" /> : null}
            <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: `var(--${d}-ink)` }}>
              <Icon className="size-3.5" strokeWidth={2} aria-hidden />
              {DESTINATION[d].short}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** A small route illustration: the request leaves on the left and lands on its destination(s). */
function RouteArt({ id }: { id: string }) {
  const s = SCENARIO_STORY[id];
  if (!s) return null;
  const stops: Destination[] = s.then ? [s.destination, s.then] : [s.destination];
  const last = stops[stops.length - 1];
  return (
    <span
      className="relative mb-4 flex h-[72px] items-center gap-2 overflow-hidden rounded-2xl border px-4"
      style={{
        borderColor: `var(--${last}-line)`,
        background: `radial-gradient(120% 160% at 100% 0%, color-mix(in srgb, var(--${last}) 34%, transparent), transparent 62%), radial-gradient(90% 120% at 0% 100%, color-mix(in srgb, var(--${stops[0]}) 18%, transparent), transparent 60%), var(--surface-2)`,
      }}
      aria-hidden
    >
      <span className="size-2.5 shrink-0 rounded-full bg-fg-2 shadow-[0_0_10px_var(--fg-3)]" />
      {stops.map((d, i) => {
        const Icon = DESTINATION_ICON[d];
        return (
          <span key={`${d}-${i}`} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className="h-[2px] min-w-4 flex-1 rounded-full"
              style={{ background: `linear-gradient(90deg, ${i === 0 ? "var(--fg-4)" : `var(--${stops[i - 1]})`}, var(--${d}))`, boxShadow: `0 0 8px var(--${d})` }}
            />
            <span className="icon-tile size-10" style={{ "--tone": `var(--${d})`, "--tone-ink": `var(--${d}-ink)` } as CSSProperties}>
              <Icon className="size-5" strokeWidth={1.9} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

function CardBody({ s }: { s: Scenario }) {
  const story = SCENARIO_STORY[s.id];
  const cls = story?.classification;
  return (
    <>
      <RouteArt id={s.id} />
      {cls ? (
        <span className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-3">
          <ClassificationIcon value={cls} className="size-3.5" />
          {CLASSIFICATION_META[cls].label}
        </span>
      ) : null}
      <span className="font-display text-[17px] font-semibold leading-snug text-fg sm:text-lg">{story?.title ?? s.title}</span>
      <span className="mt-1 hidden text-sm text-fg-3 sm:block">{story?.story ?? s.summary}</span>
      <RouteCue id={s.id} className="mt-auto pt-3" />
    </>
  );
}

const cardCls = (active?: boolean) =>
  cn(
    "spotlight group relative flex flex-col rounded-[22px] border p-3.5 text-left transition-[background-color,border-color,transform,box-shadow] duration-[var(--dur)] ease-[var(--ease-out)] hover:-translate-y-0.5 sm:p-4",
    active ? "border-brand bg-brand-soft shadow-[0_0_0_1px_var(--brand),0_20px_50px_-24px_var(--brand)]" : "border-line bg-surface hover:border-line-strong",
  );

/** The six scenarios as stories worth clicking. Links (overview) or buttons (route console). `className` sets the columns. */
export function ScenarioStories({
  scenarios,
  activeId,
  onPick,
  className,
}: {
  scenarios: Scenario[];
  activeId?: string | null;
  onPick?: (s: Scenario) => void;
  className?: string;
}) {
  return (
    <ul className={cn("grid gap-3", className ?? "grid-cols-2 xl:grid-cols-3")}>
      {scenarios.map((s) => (
        <li key={s.id} className="flex">
          {onPick ? (
            <button type="button" aria-pressed={activeId === s.id} onClick={() => onPick(s)} className={cn(cardCls(activeId === s.id), "w-full")}>
              <CardBody s={s} />
            </button>
          ) : (
            <Link href={`/route?scenario=${s.id}`} className={cn(cardCls(), "w-full")}>
              <CardBody s={s} />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
