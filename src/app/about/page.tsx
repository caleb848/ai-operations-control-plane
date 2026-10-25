import { ArrowRight, Check, ClipboardCheck, Cloud, Cpu, FlaskConical, Gauge, Laptop, Lock, ScanSearch, ShieldCheck, UserRoundCheck, Wallet, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/primitives";
import { cn } from "@/lib/format";

export const metadata: Metadata = { title: "How this demo works" };

const PIPELINE: { stage: string; real: boolean; note: string; icon: LucideIcon }[] = [
  { stage: "Classify", real: true, note: "Sensitivity scanner and task profile", icon: ScanSearch },
  { stage: "Policy", real: true, note: "Every model checked, fail-closed", icon: ShieldCheck },
  { stage: "Score and route", real: true, note: "Privacy, cost, task fit, reasoning, latency", icon: Gauge },
  { stage: "Budget Guard", real: true, note: "Worst case reserved before any call", icon: Wallet },
  { stage: "Model execution", real: false, note: "Recorded replays where one exists", icon: Cpu },
  { stage: "Evaluation", real: true, note: "On recorded text; simulated text is skipped", icon: ClipboardCheck },
  { stage: "Review and trace", real: true, note: "Approval queue and full request trace", icon: UserRoundCheck },
];

const REAL = [
  "Task classification and the sensitivity scanner (personal data, credentials, markings)",
  "Governance policy evaluation for every model, including fail-closed blocking",
  "Routing scores across privacy, cost, task fit, reasoning and latency",
  "Budget Guard, worst-case cost reservation and fallback chains",
  "Human-review rules, the approval queue and the request trace",
];
const SIMULATED = [
  "Model inference: no model is called from this site",
  "Local outputs: replays of real Gemma 4 12B and Qwen 3.5 9B runs recorded on the developer's Mac where one exists for the exact task; otherwise an explicit notice",
  "Cloud outputs: illustrative text, always labeled simulated, never evaluated or recommended",
  "Latency and cost of cloud models: the router's estimates at list price",
];
const LOCAL = [
  "Discovers installed Ollama models and runs them on the device, at $0 in API fees",
  "Optionally calls Claude through the Anthropic API, behind two explicit switches and a worst-case budget reservation",
  "Measures real latency and throughput and feeds them back into routing",
  "Keeps history, approvals and the spend ledger in SQLite",
];

const card = "card p-6 sm:p-8";

function List({ items, icon }: { items: string[]; icon: ReactNode }) {
  return (
    <ul className="mt-5 space-y-3">
      {items.map((t) => (
        <li key={t} className="flex gap-3 text-md text-fg-2">
          <span className="mt-0.5 shrink-0">{icon}</span>
          {t}
        </li>
      ))}
    </ul>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        eyebrow="How this demo works"
        title={<>Real routing. <span className="text-brand">Simulated models.</span></>}
        description="An AI operations control plane decides whether each request runs on a local model or a cloud model, and enforces privacy, cost, quality and review rules around it. On this public site, every decision is real; only the model calls are simulated."
        actions={
          <>
            <Link href="/compare" className={cn(buttonClass("secondary", "lg"), "max-sm:hidden")}>
              Compare models
            </Link>
            <Link href="/route?scenario=confidential-client-brief" className={cn(buttonClass("primary", "lg"), "w-full sm:w-auto")}>
              Start with a scenario <ArrowRight className="size-4" />
            </Link>
          </>
        }
      />

      <div className="space-y-10">
        <section aria-labelledby="pipeline-title" className={cn(card, "card-glow overflow-hidden")}>
          <h2 id="pipeline-title" className="text-xl font-semibold text-fg">
            What runs for real
          </h2>
          <p className="mt-1 text-sm text-fg-3">Every request takes the same path. One step is simulated here.</p>
          <div className="relative mt-8">
            <div className="absolute left-[7%] right-[7%] top-7 hidden h-[2px] rounded-full xl:block" style={{ background: "linear-gradient(90deg, var(--brand-2), var(--brand) 55%, color-mix(in srgb, var(--brand) 40%, transparent))", boxShadow: "0 0 14px var(--brand)" }} aria-hidden />
            <ol className="relative grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {PIPELINE.map((p, i) => (
                <li key={p.stage} className="flex flex-col items-start xl:items-center xl:text-center">
                  <span
                    className={cn("relative z-10 flex size-14 items-center justify-center rounded-2xl border", p.real ? "btn-brand" : "border-dashed border-brand-ink bg-surface text-brand-ink")}
                    style={p.real ? undefined : { boxShadow: "0 0 24px -6px var(--brand)" }}
                  >
                    <p.icon className="size-6" strokeWidth={1.8} aria-hidden />
                  </span>
                  <span className="mt-4 flex items-center gap-2 xl:justify-center">
                    <span className="tnum font-mono text-xs text-fg-3">0{i + 1}</span>
                    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", p.real ? "border-line-strong bg-surface-2 text-fg-2" : "border-brand-line bg-brand-soft text-brand-ink")}>
                      {p.real ? <Check className="size-3" aria-hidden /> : <FlaskConical className="size-3" aria-hidden />}
                      {p.real ? "Real" : "Simulated"}
                    </span>
                  </span>
                  <span className="mt-2 font-display text-lg font-semibold text-fg">{p.stage}</span>
                  <span className="mt-1 text-sm text-fg-3">{p.note}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <section aria-labelledby="real-title" className={card}>
            <h2 id="real-title" className="flex items-center gap-2 text-xl font-semibold text-fg">
              <Check className="size-5 text-fg-2" aria-hidden /> Real on this site
            </h2>
            <List items={REAL} icon={<Check className="size-4 text-fg-2" />} />
          </section>
          <section aria-labelledby="sim-title" className={card}>
            <h2 id="sim-title" className="flex items-center gap-2 text-xl font-semibold text-fg">
              <FlaskConical className="size-5 text-fg-2" aria-hidden /> Simulated on this site
            </h2>
            <List items={SIMULATED} icon={<FlaskConical className="size-4 text-fg-3" />} />
          </section>
          <section aria-labelledby="local-title" className={card}>
            <h2 id="local-title" className="flex items-center gap-2 text-xl font-semibold text-fg">
              <Laptop className="size-5 text-local-ink" aria-hidden /> A local install also
            </h2>
            <List items={LOCAL} icon={<Laptop className="size-4 text-local-ink" />} />
          </section>
          <section aria-labelledby="why-title" className={card}>
            <h2 id="why-title" className="flex items-center gap-2 text-xl font-semibold text-fg">
              <Lock className="size-5 text-fg-2" aria-hidden /> Why the public site can&apos;t
            </h2>
            <div className="mt-5 space-y-3 text-md text-fg-2">
              <p>It deliberately cannot reach the developer&apos;s local Ollama runtime: there is no tunnel, proxy or exposed port to any private machine.</p>
              <p>
                No provider credentials are used in Portfolio Mode. Paid API execution is disabled server-side, so no visitor can generate paid usage. Requests that ask for
                live execution are rejected with a 403, not quietly downgraded.
              </p>
              <p className="flex items-start gap-2 text-sm text-fg-3">
                <Cloud className="mt-0.5 size-4 shrink-0" aria-hidden /> Anything you type is processed in memory by deterministic code and returned only to you; it is never
                added to the shared demo history.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
