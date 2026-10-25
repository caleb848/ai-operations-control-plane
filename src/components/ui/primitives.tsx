import { Tooltip as RTooltip } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/format";

/** A grouped surface. Use sparingly: most structure should come from spacing and type, not boxes. */
export function Panel({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={cn("card", className)} {...rest}>
      {children}
    </section>
  );
}

export const Card = Panel;

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
    <header className={cn("flex items-start justify-between gap-4 px-5 pb-1 pt-4", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? <span className="mt-[3px] text-fg-3">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="text-md font-semibold text-fg">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-fg-3">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** A titled page section without a box around it. */
export function Section({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20", className)} aria-labelledby={id && title ? `${id}-title` : undefined}>
      {title || eyebrow || actions ? (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 max-w-2xl">
            {eyebrow ? <div className="eyebrow mb-1.5">{eyebrow}</div> : null}
            {title ? (
              <h2 id={id ? `${id}-title` : undefined} className="text-xl font-semibold text-fg">
                {title}
              </h2>
            ) : null}
            {description ? <p className="mt-1 text-base text-fg-3">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("eyebrow", className)}>{children}</div>;
}

/** v1 name for an eyebrow label. */
export const SectionLabel = Eyebrow;

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "local" | "cloud" | "review";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "btn-brand",
  secondary: "bg-surface/80 text-fg border border-line-strong hover:bg-surface-2 hover:border-fg-4",
  ghost: "text-fg-2 hover:text-fg hover:bg-surface-2 border border-transparent",
  danger: "bg-danger-soft text-danger-ink border border-danger-line hover:bg-danger/15",
  local: "bg-local-soft text-local-ink border border-local-line hover:bg-local/20",
  cloud: "bg-cloud-soft text-cloud-ink border border-cloud-line hover:bg-cloud/20",
  review: "bg-review-soft text-review-ink border border-review-line hover:bg-review/20",
};

/** Button styling, also for links that should look like buttons. */
export function buttonClass(variant: ButtonVariant = "secondary", size: "sm" | "md" | "lg" = "md") {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background-color,border-color,color,transform,opacity,filter,box-shadow] duration-[var(--dur-fast)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
    size === "sm" ? "h-10 px-3.5 text-sm sm:h-8" : size === "lg" ? "h-11 px-5 text-md" : "h-10 px-4 text-sm sm:h-9",
    BUTTON_STYLES[variant],
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" | "lg" }>(
  function Button({ variant = "secondary", size = "md", className, ...rest }, ref) {
    return <button ref={ref} className={cn(buttonClass(variant, size), className)} {...rest} />;
  },
);

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(function IconButton(
  { label, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-full text-fg-3 transition-colors duration-[var(--dur-fast)] hover:bg-surface-2 hover:text-fg active:scale-[0.96] sm:size-9",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line-strong bg-surface-2 px-1 font-mono text-[11px] text-fg-3", className)}>{children}</kbd>;
}

export function Tip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <RTooltip.Root delayDuration={200}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={8}
          collisionPadding={12}
          className="z-50 max-w-[320px] animate-fade-in rounded-lg border border-line-strong bg-surface-3 px-3 py-2 text-sm leading-5 text-fg shadow-[var(--shadow-pop)]"
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

export function Empty({ title, children, icon, action }: { title: string; children?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon ? <div className="flex size-10 items-center justify-center rounded-full border border-line bg-surface-2 text-fg-3">{icon}</div> : null}
      <div>
        <div className="text-md font-medium text-fg">{title}</div>
        {children ? <div className="mx-auto mt-1 max-w-sm text-sm text-fg-3">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px bg-line", className)} />;
}

export function KeyValue({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5 text-sm", className)}>
      <span className="text-fg-3">{label}</span>
      <span className="text-right text-fg">{children}</span>
    </div>
  );
}

/** A single figure with its label. Big numbers carry hierarchy; labels stay quiet. */
export function Stat({
  label,
  value,
  sub,
  size = "md",
  className,
  valueClassName,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  valueClassName?: string;
}) {
  const v = { sm: "text-lg font-semibold", md: "text-2xl font-semibold", lg: "text-4xl font-semibold", xl: "text-5xl font-semibold" }[size];
  return (
    <div className={cn("min-w-0", className)}>
      <div className="eyebrow">{label}</div>
      <div className={cn("tnum mt-1.5 text-fg", v, valueClassName)}>{value}</div>
      {sub ? <div className="mt-1 text-sm text-fg-3">{sub}</div> : null}
    </div>
  );
}
