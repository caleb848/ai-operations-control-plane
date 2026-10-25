"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/format";
import { Logo } from "./logo";
import { isActive, NAV } from "./nav";
import { useStatus } from "./status-context";
import { EnvironmentCard, ThemeToggle } from "./topbar";

export function Sidebar() {
  return (
    <div className="card flex h-full flex-col overflow-hidden !rounded-[28px]">
      <div className="pointer-events-none absolute -left-16 -top-20 size-56 rounded-full bg-brand/25 blur-3xl" aria-hidden />
      <Link href="/" className="relative mx-3 mt-3 flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors hover:bg-surface-2/70">
        <Logo size={36} />
        <div className="min-w-0 leading-tight">
          <div className="font-display text-lg font-semibold text-fg">Control Plane</div>
          <div className="text-xs text-fg-3">AI traffic control</div>
        </div>
      </Link>

      <nav aria-label="Primary" className="scrollbar-thin relative mt-5 flex-1 overflow-y-auto px-3">
        {/* usePathname suspends on dynamic routes during prerender; the fallback renders the same links unhighlighted. */}
        <Suspense fallback={<NavLinks pathname={null} />}>
          <ActiveNav />
        </Suspense>
      </nav>

      <div className="relative space-y-2 p-3">
        <EnvironmentCard />
        <div className="flex items-center justify-between px-1.5">
          <span className="text-xs text-fg-3">Theme</span>
          <ThemeToggle className="size-8" />
        </div>
      </div>
    </div>
  );
}

function ActiveNav() {
  return <NavLinks pathname={usePathname()} />;
}

export function NavLinks({ pathname, onNavigate, large }: { pathname: string | null; onNavigate?: () => void; large?: boolean }) {
  const { status } = useStatus();
  return (
    <>
      {NAV.map((g, gi) => (
        <div key={g.group ?? gi} className={cn(gi > 0 && "mt-6")}>
          {g.group ? <div className="eyebrow mb-2 px-3">{g.group}</div> : null}
          <ul className="space-y-1">
            {g.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              const count = item.count === "approvals" ? status?.pendingApprovals : undefined;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-2xl px-2 transition-colors duration-[var(--dur-fast)]",
                      large ? "h-13 text-md" : "h-11 text-base",
                      active ? "bg-brand-soft text-fg" : "text-fg-2 hover:bg-surface-2/80 hover:text-fg",
                    )}
                  >
                    {active ? <span className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand shadow-[0_0_14px_var(--brand)]" aria-hidden /> : null}
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors duration-[var(--dur-fast)]",
                        active ? "btn-brand text-white" : "text-fg-3 group-hover:text-fg-2",
                      )}
                    >
                      <Icon className="size-[18px]" strokeWidth={1.8} />
                    </span>
                    <span className="flex-1 truncate font-medium">{item.label}</span>
                    {count ? (
                      <span className="tnum inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-review-line bg-review-soft px-1.5 text-xs font-semibold text-review-ink" aria-label={`${count} pending`}>
                        {count}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}
