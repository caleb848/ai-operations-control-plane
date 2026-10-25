import type { ReactNode } from "react";
import { cn } from "@/lib/format";

/** Page title block: a pill eyebrow, a headline that says what the page answers, one line of context. */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  note,
  size = "md",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  /** A quieter second line, e.g. what is simulated on this deployment. */
  note?: ReactNode;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <header className={cn("enter relative mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-5 sm:mb-10", className)}>
      <div className="pointer-events-none absolute -left-24 -top-24 -z-10 h-64 w-[36rem] max-w-full rounded-full bg-brand/15 blur-3xl" aria-hidden />
      <div className={cn("min-w-0", size === "lg" ? "max-w-5xl" : "max-w-4xl")}>
        {eyebrow ? (
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-line bg-brand-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-brand-ink">
            <span className="size-1.5 rounded-full bg-brand-ink shadow-[0_0_8px_var(--brand-ink)]" aria-hidden />
            {eyebrow}
          </div>
        ) : null}
        <h1 className={size === "lg" ? "text-4xl font-semibold leading-[1.05] text-fg sm:text-5xl xl:text-6xl" : "text-3xl font-semibold leading-[1.08] text-fg sm:text-4xl xl:text-5xl"}>{title}</h1>
        {description ? <p className={cn("max-w-3xl text-fg-2", size === "lg" ? "mt-5 text-lg" : "mt-4 text-md sm:text-lg")}>{description}</p> : null}
        {note ? <p className="mt-2 text-base text-fg-3">{note}</p> : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div> : null}
    </header>
  );
}
