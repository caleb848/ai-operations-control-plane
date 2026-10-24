import type { ReactNode } from "react";

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-xs text-fg-3">{eyebrow}</div> : null}
        <h1 className="text-[19px] font-semibold leading-7 tracking-[-0.015em] text-fg">{title}</h1>
        {description ? <p className="mt-0.5 max-w-3xl text-sm text-fg-3">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
