import { Check, FlaskConical, Radio, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetSession } from "@/components/budget/reset-session";
import { Meter } from "@/components/charts/charts";
import { PageHeader } from "@/components/ui/page-header";
import { Empty, KeyValue, Panel, PanelHeader, Skeleton } from "@/components/ui/primitives";
import { budgetData } from "@/server/queries";
import { cn, formatUsd, shortDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Budget" };

export default function BudgetPage() {
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader title="Budget & spend controls" description="Paid API usage is opt-in, capped per session and lifetime, and reserved at worst case before every call." />
      <Suspense fallback={<Skeleton className="h-[640px] w-full rounded-lg" />}>
        <Budget />
      </Suspense>
    </div>
  );
}

const SAFEGUARDS = [
  ["Two-key live mode", "Paid calls need AI_LIVE_MODE=true and DEFAULT_PROVIDER=live. Anything else serves cloud models from MockProvider."],
  ["Worst-case reservation", "Before a call, input + max_tokens at list price must fit the remaining session and lifetime budget."],
  ["Budget Guard reroute", "When cloud doesn't fit, a capable local model takes the request; otherwise it is blocked."],
  ["Hard token caps", "max_tokens comes from the router's estimate, capped by LIVE_MAX_OUTPUT_TOKENS."],
  ["No uncontrolled retries", "SDK retries are off (maxRetries: 0). The control plane never retries the same model; at most 3 attempts across the pre-approved fallback chain."],
  ["Explicit confirmation", "The UI asks for a second click showing the worst-case cost before any paid call."],
  ["Response cache", "Identical live requests are answered from cache at $0 instead of being paid for twice."],
  ["Tests can't spend", "Unit tests block all network access; providers refuse to call paid APIs under the test runner."],
  ["LLM-as-judge off", "Evaluation is heuristic by default, so scoring never adds API spend."],
];

async function Budget() {
  const { budget: b, ledger, cache, config } = await budgetData();
  const sessionSpent = b.sessionActualUsd + b.sessionSimulatedUsd;
  const portfolio = config.deployment.mode === "portfolio";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-fg-3">Session budget</div>
              <div className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-fg">
                {formatUsd(sessionSpent)} <span className="text-sm font-normal text-fg-3">of {formatUsd(b.sessionBudgetUsd)}</span>
              </div>
            </div>
            {portfolio ? null : <ResetSession />}
          </div>
          <Meter value={b.sessionBudgetUsd ? sessionSpent / b.sessionBudgetUsd : 1} className="mt-3" />
          <div className="mt-3 space-y-0.5">
            <KeyValue label="Actual (paid)">{formatUsd(b.sessionActualUsd)}</KeyValue>
            {portfolio ? (
              <KeyValue label="Simulated (shown, not counted here)">{formatUsd(b.sessionSimulatedTotalUsd)}</KeyValue>
            ) : (
              <KeyValue label="Simulated (demo, counted toward guard)">{formatUsd(b.sessionSimulatedUsd)}</KeyValue>
            )}
            <KeyValue label="Remaining">{formatUsd(b.remainingUsd)}</KeyValue>
            <KeyValue label="Started">{shortDateTime(b.sessionStartedAt)}</KeyValue>
          </div>
        </Panel>
        <Panel className="p-4">
          <div className="text-xs text-fg-3">Lifetime paid spend</div>
          <div className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-fg">
            {formatUsd(b.lifetimeActualUsd)} <span className="text-sm font-normal text-fg-3">of {formatUsd(b.lifetimeBudgetUsd)} cap</span>
          </div>
          <Meter value={b.lifetimeBudgetUsd ? b.lifetimeActualUsd / b.lifetimeBudgetUsd : 1} className="mt-3" />
          <p className="mt-3 text-xs text-fg-3">The lifetime cap (LIFETIME_BUDGET_USD) protects the overall development budget across sessions. Only real, provider-reported usage counts here.</p>
          <div className="mt-2 space-y-0.5">
            <KeyValue label="Cached live responses">{cache.entries}</KeyValue>
          </div>
        </Panel>
        {portfolio ? (
          <Panel className="border-warn/30 p-4">
            <div className="flex items-center gap-2 text-xs text-fg-3">
              <FlaskConical className="size-3.5 text-warn-fg" />
              Cloud execution mode
            </div>
            <div className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-warn-fg">PORTFOLIO DEMO</div>
            <ul className="mt-2 space-y-1.5 text-xs text-fg-2">
              <li>Paid execution is rejected server-side, whatever a request asks for.</li>
              <li>No provider keys are read on this deployment, and no cloud provider client exists in the server process.</li>
              <li>Ollama is never contacted; local models are simulated.</li>
              <li>Budget Guard runs for real: scenario 05 sets the session spend explicitly. Visitors share this server, so their simulated spend is shown but never counts toward the guard.</li>
            </ul>
          </Panel>
        ) : (
        <Panel className={cn("p-4", config.cloudLive ? "border-cloud-line" : "border-warn/30")}>
          <div className="flex items-center gap-2 text-xs text-fg-3">
            {config.cloudLive ? <Radio className="size-3.5 text-cloud-fg" /> : <FlaskConical className="size-3.5 text-warn-fg" />}
            Cloud execution mode
          </div>
          <div className={cn("mt-1 text-[24px] font-semibold tracking-[-0.02em]", config.cloudLive ? "text-cloud-fg" : "text-warn-fg")}>{config.cloudLive ? "LIVE API" : "DEMO"}</div>
          <div className="mt-2 space-y-0.5">
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
            <p className="mt-3 rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-2xs leading-4 text-fg-2">
              # .env.local
              <br />
              AI_LIVE_MODE=true
              <br />
              DEFAULT_PROVIDER=live
              <br />
              ANTHROPIC_API_KEY=…
            </p>
          ) : null}
        </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Panel>
          <PanelHeader title="Safeguards" description="Why paid testing stays within a small budget" icon={<ShieldCheck className="size-4" />} />
          <ul className="divide-y divide-line">
            {SAFEGUARDS.map(([t, d]) => (
              <li key={t} className="flex gap-3 px-4 py-2.5">
                <Check className="mt-0.5 size-3.5 shrink-0 text-ok-fg" />
                <div>
                  <div className="text-sm text-fg">{t}</div>
                  <div className="text-xs text-fg-3">{d}</div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <PanelHeader title="Spend ledger" description="Every charge, tagged actual or simulated" />
          {ledger.length === 0 ? (
            <Empty title="No charges yet">Local runs never create charges. Simulated cloud runs appear here tagged as simulated.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-fg-3">
                    <th className="px-4 py-2 font-normal">Time</th>
                    <th className="px-2 py-2 font-normal">Model</th>
                    <th className="px-2 py-2 font-normal">Kind</th>
                    <th className="px-2 py-2 text-right font-normal">Tokens</th>
                    <th className="px-4 py-2 text-right font-normal">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((e) => (
                    <tr key={e.id} className="border-b border-line last:border-0">
                      <td className="tnum px-4 py-2 text-xs text-fg-3">{shortDateTime(e.at)}</td>
                      <td className="px-2 py-2 text-fg-2">{e.modelId?.split(":")[1] ?? "—"}</td>
                      <td className="px-2 py-2 text-xs">
                        {e.kind === "actual" ? (
                          <span className="text-cloud-fg">actual</span>
                        ) : e.kind === "simulated" ? (
                          <span className="text-warn-fg">simulated</span>
                        ) : (
                          <span className="text-fg-2">{e.kind === "reserved" ? "reserved (in flight)" : "unreconciled (timeout)"}</span>
                        )}
                      </td>
                      <td className="tnum px-2 py-2 text-right text-xs text-fg-3">
                        {e.inputTokens ?? "—"} → {e.outputTokens ?? "—"}
                      </td>
                      <td className="tnum px-4 py-2 text-right text-fg">{formatUsd(e.amountUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
