import { Tooltip as RTooltip } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/format";

export function Panel({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={cn("rounded-lg border border-line bg-surface", className)} {...rest}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <header className={cn("flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-2.5", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {icon ? <span className="text-fg-3">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium text-fg">{title}</h2>
          {description ? <p className="truncate text-xs text-fg-3">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-2xs font-medium uppercase tracking-[0.08em] text-fg-3", className)}>{children}</div>;
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "local" | "cloud";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }>(
  function Button({ variant = "secondary", size = "md", className, ...rest }, ref) {
    const styles: Record<ButtonVariant, string> = {
      primary: "bg-fg text-bg hover:opacity-90 border border-transparent",
      secondary: "bg-surface-2 text-fg border border-line hover:bg-surface-3 hover:border-line-strong",
      ghost: "text-fg-2 hover:text-fg hover:bg-surface-2 border border-transparent",
      danger: "bg-danger-soft text-danger-fg border border-transparent hover:border-danger/40",
      local: "bg-local text-white border border-transparent hover:opacity-90",
      cloud: "bg-cloud text-white border border-transparent hover:opacity-90",
    };
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[background,border,opacity,color] duration-150 disabled:pointer-events-none disabled:opacity-45",
          size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
          styles[variant],
          className,
        )}
        {...rest}
      />
    );
  },
);

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-surface-2 px-1 font-mono text-2xs text-fg-3">{children}</kbd>;
}

export function Tip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <RTooltip.Root delayDuration={150}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-[300px] animate-fade-in rounded-md border border-line-strong bg-surface-3 px-2.5 py-1.5 text-xs text-fg shadow-[var(--shadow-pop)]"
        >
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon ? <div className="text-fg-4">{icon}</div> : null}
      <div className="text-sm font-medium text-fg-2">{title}</div>
      {children ? <div className="max-w-sm text-xs text-fg-3">{children}</div> : null}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px bg-line", className)} />;
}

export function KeyValue({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1 text-xs", className)}>
      <span className="text-fg-3">{label}</span>
      <span className="text-right text-fg">{children}</span>
    </div>
  );
}
