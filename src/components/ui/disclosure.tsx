"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";

/** Progressive disclosure: a labeled toggle that reveals detail with a short height transition. */
export function Disclosure({
  title,
  hint,
  icon,
  children,
  defaultOpen = false,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={cn("rounded-xl border border-line bg-surface", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl px-5 py-3 text-left transition-colors hover:bg-surface-2/60"
      >
        {icon ? <span className="text-fg-3">{icon}</span> : null}
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium text-fg">{title}</span>
          {hint ? <span className="block text-sm text-fg-3">{hint}</span> : null}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-fg-3 transition-transform duration-[var(--dur)]", open && "rotate-180")} />
      </button>
      <div id={id} className={cn("grid transition-[grid-template-rows] duration-[var(--dur-slow)] ease-[var(--ease-out)]", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden" inert={!open}>
          <div className={cn("border-t border-line px-5 py-5", bodyClassName)}>{children}</div>
        </div>
      </div>
    </div>
  );
}
