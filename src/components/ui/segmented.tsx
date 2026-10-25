"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/format";
import { Tip } from "./primitives";

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; hint?: string }[];
  className?: string;
  size?: "sm" | "md";
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex gap-0.5 rounded-full border border-line bg-surface-2/80 p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        const btn = (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-full px-3 font-medium transition-[background-color,color,box-shadow] duration-[var(--dur-fast)]",
              size === "sm" ? "h-9 text-sm sm:h-8" : "h-10 text-sm sm:h-9",
              active ? "btn-brand !text-white" : "text-fg-3 hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
        return o.hint ? (
          <Tip key={o.value} content={o.hint}>
            {btn}
          </Tip>
        ) : (
          btn
        );
      })}
    </div>
  );
}
