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
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex rounded-md border border-line bg-surface-2 p-0.5", className)}>
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
              "flex-1 whitespace-nowrap rounded-[5px] px-2 font-medium transition-[background,color,box-shadow] duration-150",
              size === "sm" ? "h-6 text-2xs" : "h-7 text-xs",
              active ? "bg-surface text-fg shadow-[0_0_0_1px_var(--line-strong)]" : "text-fg-3 hover:text-fg",
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
