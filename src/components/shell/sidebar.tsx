"use client";

import { BadgeCheck, Boxes, FlaskConical, LayoutDashboard, ListTree, Route, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { StatusDot } from "@/components/ui/badges";
import { Skeleton } from "@/components/ui/primitives";
import { cn, formatMs } from "@/lib/format";
import { Logo } from "./logo";
import { useDeployment } from "./deployment-context";
import { useStatus } from "./status-context";

const NAV = [
  {
    group: "Operate",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/route", label: "Route a task", icon: Route },
      { href: "/compare", label: "Comparison Lab", icon: FlaskConical },
      { href: "/requests", label: "Requests", icon: ListTree },
      { href: "/approvals", label: "Approvals", icon: BadgeCheck, count: "approvals" as const },
    ],
  },
  {
    group: "Govern",
    items: [
      { href: "/governance", label: "Policies", icon: ShieldCheck },
      { href: "/models", label: "Model registry", icon: Boxes },
      { href: "/budget", label: "Budget", icon: Wallet },
    ],
  },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center gap-2.5 px-4">
        <Logo />
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-[-0.01em] text-fg">Control Plane</div>
          <div className="text-2xs text-fg-3">AI Operations · Demo workspace</div>
        </div>
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 pt-3">
        {/* usePathname suspends on dynamic routes during prerender; the fallback renders the same links unhighlighted. */}
        <Suspense fallback={<NavLinks pathname={null} onNavigate={onNavigate} />}>
          <ActiveNav onNavigate={onNavigate} />
        </Suspense>
      </nav>

      <LocalAiCard />
    </div>
  );
}

function ActiveNav({ onNavigate }: { onNavigate?: () => void }) {
  return <NavLinks pathname={usePathname()} onNavigate={onNavigate} />;
}

function NavLinks({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  const { status } = useStatus();
  const active = (href: string) => pathname !== null && (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <>
        {NAV.map((g) => (
          <div key={g.group} className="mb-4">
            <div className="px-2 pb-1 text-2xs font-medium uppercase tracking-[0.08em] text-fg-4">{g.group}</div>
            {g.items.map((item) => {
              const Icon = item.icon;
              const isActive = active(item.href);
              const count = item.count === "approvals" ? status?.pendingApprovals : undefined;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group mb-px flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors",
                    isActive ? "bg-surface-3 text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <Icon className={cn("size-4", isActive ? "text-fg" : "text-fg-3 group-hover:text-fg-2")} strokeWidth={1.75} />
                  <span className="flex-1">{item.label}</span>
                  {count ? (
                    <span className="tnum rounded bg-warn-soft px-1.5 text-2xs font-medium leading-[18px] text-warn-fg">{count}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
    </>
  );
}

function LocalAiCard() {
  const { status } = useStatus();
  const { portfolio } = useDeployment();
  if (portfolio) {
    return (
      <Link href="/about" className="m-3 block rounded-lg border border-line bg-surface-2 p-3 transition-colors hover:border-line-strong">
        <div className="flex items-center justify-between">
          <span className="text-2xs font-medium uppercase tracking-[0.08em] text-fg-3">Local AI</span>
          <span className="text-xs font-medium text-warn-fg">Simulated</span>
        </div>
        <div className="mt-2 text-sm font-medium text-fg">Gemma 4 12B · Qwen 3.5 9B</div>
        <div className="text-xs text-fg-3">Reference models from the developer&apos;s Mac</div>
        <p className="mt-2.5 border-t border-line pt-2 text-2xs leading-4 text-fg-3">
          On a local install these run through Ollama at $0.00 API cost. This public demo cannot reach any machine.
        </p>
      </Link>
    );
  }
  if (!status) {
    return (
      <div className="m-3 space-y-2 rounded-lg border border-line bg-surface-2 p-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>
    );
  }
  const online = status.ollama.status === "online";
  const primary = status.localModels.find((m) => m.id === status.primaryLocalId);
  return (
    <Link href="/models" className="m-3 block rounded-lg border border-line bg-surface-2 p-3 transition-colors hover:border-line-strong">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-medium uppercase tracking-[0.08em] text-fg-3">Local AI</span>
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", online ? "text-ok-fg" : "text-danger-fg")}>
          <StatusDot status={online ? "online" : "offline"} pulse />
          {online ? "Online" : "Offline"}
        </span>
      </div>
      <div className="mt-2 truncate text-sm font-medium text-fg">{primary?.displayName ?? "No local model"}</div>
      <div className="truncate text-xs text-fg-3">
        Ollama{status.ollama.version ? ` ${status.ollama.version}` : ""} · {primary?.resident ? "resident" : online ? "idle" : "not reachable"}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-line pt-2 text-2xs">
        <span className="text-fg-3">External API cost</span>
        <span className="tnum text-right text-fg">$0.00</span>
        <span className="text-fg-3">Median latency</span>
        <span className="tnum text-right text-fg">{formatMs(status.local.medianLatencyMs)}</span>
        <span className="text-fg-3">Requests today</span>
        <span className="tnum text-right text-fg">{status.local.today}</span>
      </div>
    </Link>
  );
}

