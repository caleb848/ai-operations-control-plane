import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SCENARIOS } from "@/scenarios/scenarios";

const FACTORS = ["Privacy", "Cost", "Quality", "Latency", "Risk", "Governance"];

const OUTCOME: Record<string, string> = {
  "confidential-client-brief": "Stays local, cloud blocked",
  "public-summary": "Priority mode changes the winner",
  "strategic-positioning": "Sonnet beats Opus on value",
  "provider-failure": "Outage, governed fallback",
  "budget-exhausted": "Budget Guard reroutes",
  "restricted-local-offline": "Blocked, fail-closed",
};

/** Public landing context: what the product is and where to click, in the product's own visual language. */
export function PortfolioIntro() {
  return (
    <section className="mb-4 grid grid-cols-1 gap-5 rounded-lg border border-line bg-surface p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="min-w-0">
        <div className="text-2xs font-medium uppercase tracking-[0.08em] text-fg-3">AI Operations Control Plane</div>
        <p className="mt-1.5 text-[15px] leading-6 text-fg">
          Decides, for every AI request, whether it runs on a local model or a cloud model, then enforces data policy, spend limits and human review around the
          answer.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-fg-3">Routes on</span>
          {FACTORS.map((f) => (
            <span key={f} className="rounded-[5px] border border-line bg-surface-2 px-1.5 text-xs leading-5 text-fg-2">
              {f}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-fg-3">
          In this public demo the routing engine, governance rules and budget logic run for real on every request. Model execution is simulated, and some local
          outputs are replays of real runs recorded on the developer&apos;s Mac.
        </p>
      </div>
      <div className="min-w-0">
        <div className="mb-1.5 text-2xs font-medium uppercase tracking-[0.08em] text-fg-3">Try a scenario</div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {SCENARIOS.map((s) => (
            <Link
              key={s.id}
              href={`/route?scenario=${s.id}`}
              className="group flex items-center gap-2.5 rounded-md border border-line bg-surface-2 px-2.5 py-2 transition-colors hover:border-line-strong hover:bg-surface-3"
            >
              <span className="tnum font-mono text-2xs text-fg-4">{String(s.number).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{s.title}</span>
                <span className="block truncate text-xs text-fg-3">{OUTCOME[s.id]}</span>
              </span>
              <ArrowRight className="size-3.5 shrink-0 text-fg-4 transition-transform group-hover:translate-x-0.5 group-hover:text-fg-2" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
