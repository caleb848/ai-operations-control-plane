"use client";

import { Tooltip } from "radix-ui";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { DeploymentProvider, type DeploymentInfo } from "./deployment-context";
import { PortfolioBanner, PortfolioFooter } from "./portfolio-chrome";
import { Sidebar } from "./sidebar";
import { StatusProvider } from "./status-context";
import { TopBar } from "./topbar";

export function AppShell({ children, deployment }: { children: ReactNode; deployment: DeploymentInfo }) {
  const [open, setOpen] = useState(false);

  return (
    <DeploymentProvider value={deployment}>
    {/* Nothing changes on the public demo, so it fetches status once instead of polling. */}
    <StatusProvider intervalMs={deployment.portfolio ? 0 : 8000}>
      <Tooltip.Provider delayDuration={150} skipDelayDuration={300}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-fg focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-bg"
        >
          Skip to content
        </a>
        <div className="flex min-h-dvh">
          <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 border-r border-line bg-surface lg:block">
            <Sidebar />
          </aside>
          {open ? <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden /> : null}
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-50 w-[248px] border-r border-line bg-surface transition-transform duration-200 lg:hidden",
              open ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            {deployment.portfolio ? <PortfolioBanner /> : null}
            <TopBar onMenu={() => setOpen(true)} />
            <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pb-16 pt-5 outline-none md:px-6">
              {children}
            </main>
            {deployment.portfolio ? <PortfolioFooter /> : null}
          </div>
        </div>
      </Tooltip.Provider>
    </StatusProvider>
    </DeploymentProvider>
  );
}
