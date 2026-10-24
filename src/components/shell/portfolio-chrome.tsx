"use client";

import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { useDeployment } from "./deployment-context";

/** Persistent strip on the public deployment so no visitor mistakes simulated output for live inference. */
export function PortfolioBanner() {
  return (
    <div className="hatch border-b border-warn/30 px-4 py-1.5 text-xs text-fg-2 md:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span className="inline-flex items-center gap-1.5 font-semibold tracking-[0.04em] text-warn-fg">
          <FlaskConical className="size-3.5" /> PORTFOLIO DEMO
        </span>
        <span>Routing, governance and cost logic are real · model execution is simulated · no provider credentials are used · no access to the developer&apos;s machine</span>
        <Link href="/about" className="ml-auto font-medium text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg">
          How this demo works
        </Link>
      </div>
    </div>
  );
}

export function PortfolioFooter() {
  const { links } = useDeployment();
  return (
    <footer className="border-t border-line px-4 py-4 text-xs text-fg-3 md:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-1">
        <span>Built as an exploration of hybrid AI operations: model routing, governance, observability and AI economics.</span>
        <span className="ml-auto flex gap-4">
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
