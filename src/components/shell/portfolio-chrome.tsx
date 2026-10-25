"use client";

import { ChevronRight, FlaskConical } from "lucide-react";
import Link from "next/link";
import { useDeployment } from "./deployment-context";

/**
 * Public deployment disclosure, on every page. Quiet but unambiguous: routing
 * is real, model execution is simulated, nothing is called from this site.
 */
export function PortfolioBanner() {
  return (
    <aside aria-label="Portfolio Mode" className="border-b border-line/70 bg-brand-soft lg:hidden">
      <Link href="/about" className="flex min-h-11 items-center gap-2 px-4 py-2 text-sm sm:hidden">
        <FlaskConical className="size-4 shrink-0 text-brand-ink" strokeWidth={1.75} aria-hidden />
        <span className="font-medium text-fg">Portfolio Mode</span>
        <span className="text-fg-3">· Simulated model execution</span>
        <ChevronRight className="ml-auto size-4 shrink-0 text-fg-3" aria-label="How it works" />
      </Link>
      <div className="hidden min-h-10 flex-wrap items-center gap-x-3 gap-y-1 px-8 py-2 text-sm sm:flex">
        <span className="inline-flex items-center gap-2 font-medium text-fg">
          <FlaskConical className="size-4 text-brand-ink" strokeWidth={1.75} aria-hidden />
          Portfolio Mode
        </span>
        <span className="text-fg-3">Routing, governance and cost logic run for real. Model execution is simulated; no model is called from this site.</span>
        <Link href="/about" className="ml-auto font-medium text-fg-2 underline decoration-line-strong underline-offset-4 transition-colors hover:text-fg hover:decoration-fg-3">
          How it works
        </Link>
      </div>
    </aside>
  );
}

export function PortfolioFooter() {
  const { links } = useDeployment();
  return (
    <footer className="border-t border-line px-4 py-6 text-sm text-fg-3 md:px-8">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-2">
        <span>An exploration of hybrid AI operations: model routing, governance, observability and AI economics.</span>
        <span className="ml-auto flex gap-5">
          <Link href="/about" className="hover:text-fg">
            About this demo
          </Link>
          {links.github ? (
            <a href={links.github} target="_blank" rel="noopener noreferrer" className="hover:text-fg">
              GitHub
            </a>
          ) : null}
          {links.linkedin ? (
            <a href={links.linkedin} target="_blank" rel="noopener noreferrer" className="hover:text-fg">
              LinkedIn
            </a>
          ) : null}
        </span>
      </div>
    </footer>
  );
}
