"use client";

import { ArrowUpRight, Cloud, FlaskConical, Laptop, Moon, Radio, Search, Sun } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Meter } from "@/components/charts/charts";
import { StatusDot } from "@/components/ui/badges";
import { IconButton, Skeleton } from "@/components/ui/primitives";
import { cn, formatUsd } from "@/lib/format";
import { useCommandPalette } from "./command-palette";
import { useDeployment } from "./deployment-context";
import { useStatus } from "./status-context";

/** Desktop header: search and jump, what is simulated here, live status, theme. */
export function TopBar() {
  const { portfolio } = useDeployment();
  const { status } = useStatus();
  const palette = useCommandPalette();
  const online = status?.ollama.status === "online";
  return (
    <header className="glass-bar sticky top-0 z-30 hidden h-16 items-center gap-4 border-b border-line/70 px-8 lg:flex">
      <button
        type="button"
        onClick={palette.open}
        className="group flex h-10 w-[min(380px,36%)] items-center gap-2.5 rounded-full border border-line bg-surface/70 pl-4 pr-2 text-sm text-fg-3 transition-colors duration-[var(--dur-fast)] hover:border-line-strong hover:text-fg-2"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="rounded-md border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-fg-3">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        {portfolio ? (
          <Link
            href="/about"
            aria-label="Portfolio Mode: model execution is simulated, routing is real. How it works."
            className="group inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full border border-brand-line bg-brand-soft pl-3 pr-3.5 text-sm text-fg-2 transition-colors hover:text-fg"
          >
            <FlaskConical className="size-4 text-brand-ink" aria-hidden />
            <span className="font-medium text-fg">Portfolio Mode</span>
            {/* Both lengths stay a prefix of the accessible name. */}
            <span className="hidden xl:inline">
              · model execution is simulated<span className="hidden 2xl:inline">, routing is real</span>
            </span>
            <ArrowUpRight className="size-3.5 text-fg-3 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" aria-hidden />
          </Link>
        ) : null}
        <span className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface/70 px-3.5 text-sm text-fg-2">
          <StatusDot status="online" pulse /> Engine live
        </span>
        {!portfolio && status ? (
          <span className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface/70 px-3.5 text-sm text-fg-2">
            <Laptop className="size-4 text-local-ink" aria-hidden />
            {online ? "Local AI online" : <span className="text-danger-ink">Local AI offline</span>}
          </span>
        ) : null}
        <ThemeToggle className="size-9 rounded-full border border-line bg-surface/70" />
      </div>
    </header>
  );
}

/** Where execution happens in this deployment. Sits at the foot of the sidebar and in the mobile sheet. */
export function EnvironmentCard({ onNavigate }: { onNavigate?: () => void }) {
  const { portfolio } = useDeployment();
  const { status } = useStatus();
  if (portfolio) {
    return (
      <Link
        href="/about"
        onClick={onNavigate}
        className="group relative block overflow-hidden rounded-2xl border border-brand-line bg-brand-soft p-4 transition-colors hover:border-brand"
      >
        <div className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-brand/30 blur-2xl" aria-hidden />
        <div className="relative flex items-center gap-2.5 text-sm font-semibold text-fg">
          <span className="icon-tile size-8 !rounded-lg">
            <FlaskConical className="size-4" strokeWidth={1.9} />
          </span>
          Portfolio Mode
        </div>
        <p className="relative mt-2.5 text-sm leading-5 text-fg-2">Routing and governance run for real. Model execution is simulated.</p>
        <span className="relative mt-2.5 inline-flex items-center gap-1 text-sm font-medium text-brand-ink">
          How this demo works <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
        </span>
      </Link>
    );
  }
  if (!status) return <Skeleton className="h-[120px] w-full rounded-2xl" />;
  const online = status.ollama.status === "online";
  const live = status.config.cloudLive;
  const b = status.budget;
  const spent = b.sessionActualUsd + b.sessionSimulatedUsd;
  const primary = status.localModels.find((m) => m.id === status.primaryLocalId);
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface-2/70 p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-fg-2">
          <Laptop className="size-4 text-local-ink" strokeWidth={1.75} /> Local AI
        </span>
        <span className={cn("inline-flex items-center gap-1.5 font-medium", online ? "text-fg" : "text-danger-ink")}>
          <StatusDot status={online ? "online" : "offline"} pulse />
          {online ? "Online" : "Offline"}
        </span>
      </div>
      {primary ? <div className="-mt-1.5 truncate pl-6 text-xs text-fg-3">{primary.displayName}</div> : null}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-fg-2">
          <Cloud className="size-4 text-cloud-ink" strokeWidth={1.75} /> Cloud
        </span>
        <span className={cn("inline-flex items-center gap-1.5 font-medium", live ? "text-cloud-ink" : "text-fg")}>
          {live ? <Radio className="size-3.5" /> : null}
          {live ? "Live API" : "Simulated"}
        </span>
      </div>
      <Link href="/budget" onClick={onNavigate} className="block border-t border-line pt-3 hover:text-fg">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-fg-3">Session budget</span>
          <span className="tnum text-fg-2">
            {formatUsd(spent)} / {formatUsd(b.sessionBudgetUsd)}
          </span>
        </div>
        <Meter value={b.sessionBudgetUsd > 0 ? spent / b.sessionBudgetUsd : 1} className="mt-2" height={5} label="Session budget used" />
      </Link>
    </div>
  );
}

const THEME_EVENT = "aiops:theme";
const subscribeTheme = (cb: () => void) => {
  window.addEventListener(THEME_EVENT, cb);
  return () => window.removeEventListener(THEME_EVENT, cb);
};
const themeSnapshot = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function ThemeToggle({ className }: { className?: string }) {
  // The theme lives on <html data-theme>, set before paint; the server renders without knowing it.
  const theme = useSyncExternalStore(subscribeTheme, themeSnapshot, () => null);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* storage unavailable: theme still switches for this view */
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  };
  return (
    <IconButton label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"} onClick={toggle} className={className}>
      {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </IconButton>
  );
}
