import { ArrowRight, Calculator, CircleCheck, Cpu, Database, FlaskConical, KeyRound, Radio, RefreshCcw, ShieldCheck, TestTube2, Wallet, Zap, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type CSSProperties } from "react";
import { ResetSession } from "@/components/budget/reset-session";
import { Meter } from "@/components/charts/charts";
import { RadialGauge } from "@/components/charts/viz";
import { DESTINATION_ICON } from "@/components/ui/badges";
import { LocalTime } from "@/components/ui/local-time";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass, Empty, KeyValue, Skeleton } from "@/components/ui/primitives";
import { budgetData } from "@/server/queries";
import { cn, formatUsd } from "@/lib/format";
import type { Destination } from "@/lib/routing-view";

export const metadata: Metadata = { title: "Budget Guard" };

export default function BudgetPage() {
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow="Budget Guard"
        title={
          <>
            Every paid call is paid for <span className="text-brand">before it happens.</span>
          </>
        }
        description="Before any cloud call, the worst case (the input plus the maximum allowed output, at list price) is reserved against the budget. If it doesn't fit, a capable local model takes the request, or nothing runs."
        actions={
          <Link href="/route?scenario=budget-exhausted" className={cn(buttonClass("secondary", "lg"), "w-full sm:w-auto")}>
            See it reroute a request <ArrowRight className="size-4" />
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-[640px] w-full rounded-3xl" />}>
        <Budget />
      </Suspense>
    </div>
  );
}

const OUTCOMES: { dest: Destination; when: string; title: string; then: string }[] = [
  { dest: "cloud", when: "The worst case fits", title: "Cloud call proceeds", then: "The reservation is replaced by the real, provider-reported cost afterwards." },
  { dest: "local", when: "It doesn't fit; a local model clears the bar", title: "Rerouted to Local AI", then: "Budget Guard reroutes the request on-device, at $0 in API fees." },
  { dest: "blocked", when: "It doesn't fit; no local model clears the bar", title: "Blocked", then: "Nothing runs and nothing is spent. The request fails closed." },
];

const SAFEGUARDS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: KeyRound, title: "Two-key live mode", body: "Paid calls need AI_LIVE_MODE=true and DEFAULT_PROVIDER=live. Anything else serves cloud models from a simulated provider." },
  { icon: Calculator, title: "Worst-case reservation", body: "Input plus max_tokens at list price must fit the remaining session and lifetime budget before a call." },
  { icon: Cpu, title: "Budget Guard reroute", body: "When cloud doesn't fit, a capable local model takes the request; otherwise it is blocked." },
  { icon: Zap, title: "Hard token caps", body: "max_tokens comes from the router's estimate, capped by LIVE_MAX_OUTPUT_TOKENS." },
  { icon: RefreshCcw, title: "No uncontrolled retries", body: "SDK retries are off. The same model is never retried; at most three attempts across the pre-approved fallback chain." },
  { icon: CircleCheck, title: "Explicit confirmation", body: "The interface asks for a second click showing the worst-case cost before any paid call." },
  { icon: Database, title: "Response cache", body: "Identical live requests are answered from cache at $0 instead of being paid for twice." },
  { icon: TestTube2, title: "Tests can't spend", body: "Unit tests block network access, and providers refuse paid calls under the test runner." },
  { icon: ShieldCheck, title: "LLM-as-judge off", body: "Evaluation is heuristic by default, so scoring never adds API spend." },
];

const tone = (d: string) => ({ "--tone": `var(--${d})`, "--tone-ink": `var(--${d}-ink)`, "--glow": `var(--${d})` }) as CSSProperties;

async function Budget() {
  const { budget: b, ledger, cache, config } = await budgetData();
  const sessionSpent = b.sessionActualUsd + b.sessionSimulatedUsd;
  const used = b.sessionBudgetUsd ? sessionSpent / b.sessionBudgetUsd : 1;
  // Same status thresholds as the lifetime meter: amber from 70%, red from 90%.
  const status = used >= 0.9 ? "danger" : used >= 0.7 ? "review" : null;
  const portfolio = config.deployment.mode === "portfolio";
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <section aria-labelledby="session-title" className="card card-glow enter flex flex-col overflow-hidden p-6 sm:p-7 xl:col-span-5" style={{ "--i": 1 } as CSSProperties}>
          <div className="pointer-events-none absolute -left-20 -top-24 size-72 rounded-full bg-brand/20 blur-3xl" aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="icon-tile size-11">
                <Wallet className="size-5" strokeWidth={1.9} />
              </span>
              <div>
                <h2 id="session-title" className="text-xl font-semibold text-fg">
                  Session budget
                </h2>
                <p className="text-sm text-fg-3">
                  Started <LocalTime iso={b.sessionStartedAt} />
                </p>
              </div>
            </div>
            {portfolio ? null : <ResetSession />}
          </div>
          <div className="relative mt-6 flex flex-1 flex-col items-center justify-center gap-6 sm:flex-row sm:justify-around">
            <RadialGauge
              value={used}
              size={200}
              stroke={18}
              from={status ? `var(--${status})` : undefined}
              to={status ? `var(--${status}-ink)` : undefined}
              label={`${Math.round(used * 100)}% of the session budget used`}
            >
              <span className="tnum font-display text-4xl font-semibold leading-none text-fg">{formatUsd(sessionSpent)}</span>
              <span className="mt-1.5 text-sm text-fg-2">of {formatUsd(b.sessionBudgetUsd)}</span>
              <span className="tnum mt-1 text-xs text-fg-3">{Math.round(used * 100)}% used</span>
            </RadialGauge>
            <dl className="grid w-full max-w-[220px] grid-cols-1 gap-2.5">
              <Stat label="Remaining" value={formatUsd(b.remainingUsd)} strong />
              <Stat label="Paid" value={formatUsd(b.sessionActualUsd)} />
              <Stat label={portfolio ? "Simulated (shown, not counted)" : "Simulated (counted)"} value={formatUsd(portfolio ? b.sessionSimulatedTotalUsd : b.sessionSimulatedUsd)} />
            </dl>
          </div>
        </section>

        <section aria-labelledby="check-title" className="card enter overflow-hidden p-6 sm:p-7 xl:col-span-7" style={{ "--i": 2 } as CSSProperties}>
          <div className="flex items-center gap-3">
            <span className="icon-tile size-11">
              <Calculator className="size-5" strokeWidth={1.9} />
            </span>
            <div>
              <h2 id="check-title" className="text-xl font-semibold text-fg">
                The worst-case check
              </h2>
              <p className="text-sm text-fg-3">Runs before every cloud request. Three outcomes, and none of them can overspend.</p>
            </div>
          </div>
          {/* decision node and connectors */}
          <div className="relative mt-7 hidden lg:block" aria-hidden>
            <div className="mx-auto flex w-max items-center gap-2 rounded-full border border-brand-line bg-brand-soft px-4 py-2 text-sm font-medium text-fg shadow-[0_0_30px_-8px_var(--brand)]">
              <span className="size-2 rounded-full bg-brand-ink shadow-[0_0_10px_var(--brand-ink)]" /> Worst case = input + max output, at list price
            </div>
            <div className="mx-auto h-5 w-px bg-gradient-to-b from-brand-ink to-line-strong" />
            <div className="relative mx-[16.66%] h-px bg-line-strong">
              {OUTCOMES.map((o, i) => (
                <span key={o.dest} className="absolute top-0 h-5 w-px" style={{ left: `${i * 50}%`, background: `linear-gradient(180deg, var(--line-strong), var(--${o.dest}))` }} />
              ))}
            </div>
            <div className="h-5" />
          </div>
          <ol className="mt-6 grid grid-cols-1 gap-3 lg:mt-0 lg:grid-cols-3">
            {OUTCOMES.map((o, i) => {
              const Icon = DESTINATION_ICON[o.dest];
              return (
                <li key={o.dest} className="card-glow relative flex flex-col overflow-hidden rounded-2xl border p-5" style={{ ...tone(o.dest), borderColor: `var(--${o.dest}-line)`, background: `linear-gradient(160deg, color-mix(in srgb, var(--${o.dest}) 20%, var(--surface)) 0%, var(--surface) 70%)` }}>
                  <span className="flex items-center justify-between">
                    <span className="icon-tile size-10">
                      <Icon className="size-5" strokeWidth={1.9} />
                    </span>
                    <span className="tnum font-mono text-xs text-fg-3">0{i + 1}</span>
                  </span>
                  <span className="mt-4 text-sm font-medium" style={{ color: `var(--${o.dest}-ink)` }}>
                    {o.when}
                  </span>
                  <span className="mt-1 font-display text-xl font-semibold text-fg">{o.title}</span>
                  <span className="mt-1.5 text-sm text-fg-2">{o.then}</span>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section aria-labelledby="lifetime-title" className="card enter flex flex-col p-6 sm:p-7" style={{ "--i": 3 } as CSSProperties}>
          <h2 id="lifetime-title" className="text-xl font-semibold text-fg">
            Lifetime paid spend
          </h2>
          <p className="text-sm text-fg-3">Protects the overall budget across sessions. Only real, provider-reported usage counts.</p>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="tnum font-display text-5xl font-semibold text-fg">{formatUsd(b.lifetimeActualUsd)}</span>
            <span className="tnum text-md text-fg-3">of {formatUsd(b.lifetimeBudgetUsd)} cap</span>
          </div>
          <Meter value={b.lifetimeBudgetUsd ? b.lifetimeActualUsd / b.lifetimeBudgetUsd : 1} className="mt-4" height={10} label="Lifetime budget used" />
          <div className="mt-auto pt-5">
            <KeyValue label="Cached live responses">{cache.entries}</KeyValue>
          </div>
        </section>

        <section aria-labelledby="mode-title" className="card enter flex flex-col p-6 sm:p-7" style={{ "--i": 4 } as CSSProperties}>
          <div className="flex items-center gap-3">
            <span className="icon-tile size-11" style={tone(config.cloudLive && !portfolio ? "cloud" : "brand")}>
              {config.cloudLive && !portfolio ? <Radio className="size-5" /> : <FlaskConical className="size-5" />}
            </span>
            <div>
              <h2 id="mode-title" className="text-xl font-semibold text-fg">
                Cloud execution: {portfolio ? "simulated" : config.cloudLive ? "live API" : "simulated"}
              </h2>
              <p className="text-sm text-fg-3">{portfolio ? "Portfolio Mode" : "This install"}</p>
            </div>
          </div>
          {portfolio ? (
            <ul className="mt-5 space-y-2.5 text-sm text-fg-2">
              <li>Paid execution is rejected server-side, whatever a request asks for.</li>
              <li>No provider credentials are used in Portfolio Mode, and no cloud provider client exists in the server process.</li>
              <li>Ollama is never contacted; local models are simulated.</li>
              <li>Budget Guard runs for real. The budget scenario sets the session spend explicitly; visitors&apos; simulated spend is shown but never counts toward the guard.</li>
            </ul>
          ) : (
            <>
              <div className="mt-5 space-y-1">
                <KeyValue label="AI_LIVE_MODE">
                  <span className="font-mono">{String(config.liveMode)}</span>
                </KeyValue>
                <KeyValue label="DEFAULT_PROVIDER">
                  <span className="font-mono">{config.defaultProvider}</span>
                </KeyValue>
                <KeyValue label="Anthropic key">{config.providers.anthropic ? "configured" : "not set"}</KeyValue>
                <KeyValue label="LIVE_MAX_OUTPUT_TOKENS">
                  <span className="tnum font-mono">{config.liveMaxOutputTokens}</span>
                </KeyValue>
              </div>
              {!config.cloudLive ? (
                <pre className="mt-4 rounded-2xl border border-line bg-surface-2 px-4 py-3 font-mono text-xs leading-5 text-fg-2">{"# .env.local\nAI_LIVE_MODE=true\nDEFAULT_PROVIDER=live\nANTHROPIC_API_KEY=…"}</pre>
              ) : null}
            </>
          )}
        </section>
      </div>

      <section aria-labelledby="safe-title" className="card enter p-6 sm:p-7" style={{ "--i": 5 } as CSSProperties}>
        <h2 id="safe-title" className="text-xl font-semibold text-fg">
          Safeguards
        </h2>
        <p className="text-sm text-fg-3">Why paid testing stays inside a small budget.</p>
        <ul className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SAFEGUARDS.map((g) => (
            <li key={g.title} className="spotlight relative flex gap-3.5 rounded-2xl border border-line bg-surface-2/60 p-4">
              <span className="icon-tile size-10">
                <g.icon className="size-[18px]" strokeWidth={1.9} />
              </span>
              <div>
                <div className="text-md font-semibold text-fg">{g.title}</div>
                <div className="mt-0.5 text-sm text-fg-3">{g.body}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ledger-title" className="card enter overflow-hidden" style={{ "--i": 6 } as CSSProperties}>
        <div className="px-6 pb-4 pt-6">
          <h2 id="ledger-title" className="text-xl font-semibold text-fg">
            Spend ledger
          </h2>
          <p className="text-sm text-fg-3">Every charge, tagged paid or simulated.</p>
        </div>
        {ledger.length === 0 ? (
          <Empty title="No charges yet">Local runs never create charges. Simulated cloud runs appear here, tagged as simulated.</Empty>
        ) : (
          <div className="overflow-x-auto border-t border-line" tabIndex={0} aria-label="Spend ledger">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-sm text-fg-3">
                  <th className="px-6 py-3 font-normal">Time</th>
                  <th className="px-3 py-3 font-normal">Model</th>
                  <th className="px-3 py-3 font-normal">Kind</th>
                  <th className="px-3 py-3 text-right font-normal">Tokens</th>
                  <th className="px-6 py-3 text-right font-normal">Amount</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                    <td className="tnum px-6 py-3 text-fg-3">
                      <LocalTime iso={e.at} />
                    </td>
                    <td className="px-3 py-3 text-fg-2">{e.modelId?.split(":")[1] ?? "—"}</td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          e.kind === "actual" ? "border-cloud-line bg-cloud-soft text-cloud-ink" : e.kind === "simulated" ? "border-line-strong bg-surface-2 text-fg-2" : "border-review-line bg-review-soft text-review-ink",
                        )}
                      >
                        {e.kind === "actual" ? "Paid" : e.kind === "simulated" ? "Simulated" : e.kind === "reserved" ? "Reserved, in flight" : "Unreconciled (timeout)"}
                      </span>
                    </td>
                    <td className="tnum px-3 py-3 text-right text-fg-3">
                      {e.inputTokens ?? "—"} → {e.outputTokens ?? "—"}
                    </td>
                    <td className="tnum px-6 py-3 text-right font-medium text-fg">{formatUsd(e.amountUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-2xl border px-4 py-3", strong ? "border-brand-line bg-brand-soft" : "border-line bg-surface-2/70")}>
      <dt className="text-xs text-fg-3">{label}</dt>
      <dd className="tnum mt-0.5 font-display text-xl font-semibold text-fg">{value}</dd>
    </div>
  );
}
