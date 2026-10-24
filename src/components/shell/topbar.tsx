"use client";

import { Cloud, FlaskConical, HardDrive, Menu, Moon, Radio, Sun } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Meter } from "@/components/charts/charts";
import { StatusDot } from "@/components/ui/badges";
import { Skeleton, Tip } from "@/components/ui/primitives";
import { cn, formatUsd } from "@/lib/format";
import { useDeployment } from "./deployment-context";
import { useStatus } from "./status-context";

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const { status } = useStatus();
  const { portfolio } = useDeployment();
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-line bg-bg/95 px-4 md:px-6">
      <button className="-ml-1 rounded-md p-1.5 text-fg-2 hover:bg-surface-2 lg:hidden" onClick={onMenu} aria-label="Open navigation">
        <Menu className="size-4" />
      </button>
      <div className="flex-1" />
      {portfolio ? <PortfolioCluster /> : status ? <ModeCluster /> : <Skeleton className="h-7 w-72" />}
      <ThemeToggle />
    </header>
  );
}

/** Public deployment: say plainly that both lanes are simulated. */
function PortfolioCluster() {
  return (
    <div className="flex items-center gap-2">
      <Tip content="Local inference is simulated in this public demo. On a local installation, local models run through Ollama on the developer's machine.">
        <span className="inline-flex h-7 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-xs">
          <HardDrive className="size-3.5 text-local-fg" />
          <span className="hidden text-fg-2 sm:inline">Local</span>
          <span className="font-medium text-fg">Simulated</span>
        </span>
      </Tip>
      <Tip content="Cloud execution is simulated. No provider credentials are used in Portfolio Mode, and paid execution is rejected server-side.">
        <span className="inline-flex h-7 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-xs">
          <Cloud className="size-3.5 text-cloud-fg" />
          <span className="hidden text-fg-2 sm:inline">Cloud</span>
          <span className="font-medium text-fg">Simulated</span>
        </span>
      </Tip>
      <span className="hidden h-7 items-center gap-1.5 rounded-md border border-warn/35 bg-warn-soft px-2.5 text-xs font-semibold tracking-[0.04em] text-warn-fg md:inline-flex">
        <FlaskConical className="size-3.5" /> PORTFOLIO DEMO
      </span>
    </div>
  );
}

function ModeCluster() {
  const { status } = useStatus();
  if (!status) return null;
  const online = status.ollama.status === "online";
  const live = status.config.cloudLive;
  const b = status.budget;
  const spent = b.sessionActualUsd + b.sessionSimulatedUsd;
  const util = b.sessionBudgetUsd > 0 ? spent / b.sessionBudgetUsd : 1;

  return (
    <div className="flex items-center gap-2">
      <Tip content={online ? `${status.ollama.detail}. Local requests run for real on this device.` : "Ollama is not reachable. Requests that policy requires to stay local will be blocked, not sent to the cloud."}>
        <span className="inline-flex h-7 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-xs">
          <HardDrive className="size-3.5 text-local-fg" />
          <span className="hidden text-fg-2 sm:inline">Local</span>
          <StatusDot status={online ? "online" : "offline"} pulse />
          <span className={cn("font-medium", online ? "text-fg" : "text-danger-fg")}>{online ? "Online" : "Offline"}</span>
        </span>
      </Tip>
      <Tip
        content={
          live
            ? "LIVE API: cloud-routed requests make real, paid API calls. Every call reserves its worst-case cost first."
            : "DEMO: cloud-routed requests are answered by MockProvider. Routing, governance and cost estimates are real; the text is simulated. Set AI_LIVE_MODE=true and DEFAULT_PROVIDER=live to enable paid calls."
        }
      >
        <span
          className={cn(
            "inline-flex h-7 items-center gap-2 rounded-md border px-2.5 text-xs font-medium",
            live ? "border-cloud-line bg-cloud-soft text-cloud-fg" : "border-warn/35 bg-warn-soft text-warn-fg",
          )}
        >
          <Cloud className="size-3.5" />
          <span className="hidden text-fg-2 sm:inline">Cloud</span>
          {live ? <Radio className="size-3.5" /> : <FlaskConical className="size-3.5" />}
          {live ? "LIVE API" : "DEMO"}
        </span>
      </Tip>
      <Tip content={`Session budget. ${formatUsd(b.sessionActualUsd)} actual${!live ? ` + ${formatUsd(b.sessionSimulatedUsd)} simulated` : ""} of ${formatUsd(b.sessionBudgetUsd)}. Lifetime real spend ${formatUsd(b.lifetimeActualUsd)} of ${formatUsd(b.lifetimeBudgetUsd)}.`}>
        <Link href="/budget" className="hidden h-7 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-xs hover:border-line-strong md:inline-flex">
          <span className="text-fg-3">Session</span>
          <span className="tnum font-medium text-fg">{formatUsd(spent)}</span>
          <span className="text-fg-4">/</span>
          <span className="tnum text-fg-2">{formatUsd(b.sessionBudgetUsd)}</span>
          <Meter value={util} className="w-12" height={4} />
        </Link>
      </Tip>
    </div>
  );
}

const THEME_EVENT = "aiops:theme";
const subscribeTheme = (cb: () => void) => {
  window.addEventListener(THEME_EVENT, cb);
  return () => window.removeEventListener(THEME_EVENT, cb);
};
const themeSnapshot = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

function ThemeToggle() {
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
    <button onClick={toggle} className="rounded-md p-1.5 text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg" aria-label="Toggle theme">
      {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </button>
  );
}
