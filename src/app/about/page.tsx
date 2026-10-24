import { Check, Cloud, FlaskConical, HardDrive, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "About this demo" };

const REAL = [
  "Task classification and the sensitivity scanner (PII, credentials, markings)",
  "Governance policy evaluation for every model, including fail-closed blocking",
  "Routing scores across privacy, cost, task fit, reasoning and latency",
  "Budget Guard, worst-case cost reservation and fallback chains",
  "Human-review rules, the approval queue and the request trace",
];
const SIMULATED = [
  "Model inference: no model is called from this site",
  "Local outputs: replays of real Gemma 4 12B / Qwen 3.5 9B runs recorded on the developer's Mac where one exists for the exact task; otherwise an explicit notice",
  "Cloud outputs: illustrative text, always labeled simulated, never evaluated or recommended",
  "Latency and cost of cloud models: the router's estimates at list price",
];
const LOCAL = [
  "Discovers installed Ollama models and runs them on the device ($0.00 API cost)",
  "Optionally calls Claude through the Anthropic API behind two explicit switches and a worst-case budget reservation",
  "Measures real latency and throughput and feeds them back into routing",
  "Keeps history, approvals and the spend ledger in SQLite",
];

function List({ items, icon }: { items: string[]; icon: React.ReactNode }) {
  return (
    <ul className="space-y-2 p-4">
      {items.map((t) => (
        <li key={t} className="flex gap-2 text-sm text-fg-2">
          <span className="mt-0.5 shrink-0">{icon}</span>
          {t}
        </li>
      ))}
    </ul>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="About this demo"
        description="An AI operations control plane: it decides whether each AI request runs on a local model or a cloud model, and enforces privacy, cost, quality and review rules around it."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel>
          <PanelHeader title="Real on this site" icon={<Check className="size-4" />} />
          <List items={REAL} icon={<Check className="size-3.5 text-ok-fg" />} />
        </Panel>
        <Panel>
          <PanelHeader title="Simulated on this site" icon={<FlaskConical className="size-4" />} />
          <List items={SIMULATED} icon={<FlaskConical className="size-3.5 text-warn-fg" />} />
        </Panel>
        <Panel>
          <PanelHeader title="The developer's local installation also" icon={<HardDrive className="size-4" />} />
          <List items={LOCAL} icon={<HardDrive className="size-3.5 text-local-fg" />} />
        </Panel>
        <Panel>
          <PanelHeader title="Why the public site can't do that" icon={<Lock className="size-4" />} />
          <div className="space-y-2 p-4 text-sm text-fg-2">
            <p>It deliberately cannot reach the developer&apos;s local Ollama runtime: there is no tunnel, proxy or exposed port to any private machine.</p>
            <p>
              No provider credentials are used in Portfolio Mode. Paid API execution is disabled server-side, so no visitor can generate paid usage. Requests that
              ask for live execution are rejected with a 403, not quietly downgraded.
            </p>
            <p className="flex items-center gap-1.5 text-xs text-fg-3">
              <Cloud className="size-3.5" /> Anything you type is processed in memory by deterministic code and returned only to you; it is never added to the shared demo history.
            </p>
          </div>
        </Panel>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/route?scenario=confidential-client-brief" className="inline-flex h-8 items-center rounded-md bg-fg px-3 text-sm font-medium text-bg hover:opacity-90">
          Start with scenario 1
        </Link>
        <Link href="/compare" className="inline-flex h-8 items-center rounded-md border border-line bg-surface-2 px-3 text-sm text-fg hover:border-line-strong">
          Open the Comparison Lab
        </Link>
      </div>
    </div>
  );
}
