"use client";

import { Tooltip } from "radix-ui";
import { useEffect, type ReactNode } from "react";
import { CommandPaletteProvider } from "./command-palette";
import { DeploymentProvider, type DeploymentInfo } from "./deployment-context";
import { MobileTabBar, MobileTopBar } from "./mobile-nav";
import { PortfolioBanner, PortfolioFooter } from "./portfolio-chrome";
import { Sidebar } from "./sidebar";
import { StatusProvider } from "./status-context";
import { TopBar } from "./topbar";

/** Feeds the pointer position to `.spotlight` cards so their highlight follows the cursor. */
function useSpotlight() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover)").matches) return;
    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>(".spotlight");
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
}

export function AppShell({ children, deployment }: { children: ReactNode; deployment: DeploymentInfo }) {
  useSpotlight();
  return (
    <DeploymentProvider value={deployment}>
      {/* Nothing changes on the public demo, so it fetches status once instead of polling. */}
      <StatusProvider intervalMs={deployment.portfolio ? 0 : 8000}>
        <Tooltip.Provider delayDuration={200} skipDelayDuration={300}>
          <CommandPaletteProvider>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-fg focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-bg"
            >
              Skip to content
            </a>
            <div className="backdrop" aria-hidden>
              <span />
            </div>
            <div className="relative z-10 flex min-h-dvh">
              <aside aria-label="Sidebar" className="sticky top-0 hidden h-dvh w-[280px] shrink-0 p-3 pr-0 lg:block">
                <Sidebar />
              </aside>
              <div className="flex min-w-0 flex-1 flex-col">
                <MobileTopBar />
                <TopBar />
                {deployment.portfolio ? <PortfolioBanner /> : null}
                <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pb-28 pt-6 outline-none md:px-8 md:pt-10 lg:pb-20">
                  {children}
                </main>
                {deployment.portfolio ? (
                  <div className="pb-20 lg:pb-0">
                    <PortfolioFooter />
                  </div>
                ) : null}
              </div>
            </div>
            <MobileTabBar />
          </CommandPaletteProvider>
        </Tooltip.Provider>
      </StatusProvider>
    </DeploymentProvider>
  );
}
