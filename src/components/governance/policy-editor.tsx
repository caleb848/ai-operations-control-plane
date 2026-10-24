"use client";

import { Check, KeyRound, Lock, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { evaluatePolicy } from "@/core/governance/evaluate";
import { CLOUD_ACCESS_LABEL, validatePolicy } from "@/core/governance/policy";
import { CLASSIFICATIONS, type CloudAccess, type DataClassification, type GovernancePolicy, type ModelDescriptor, type ProviderId } from "@/core/types";
import { ClassificationBadge } from "@/components/ui/badges";
import { Button, Panel, PanelHeader, Tip } from "@/components/ui/primitives";
import { cn } from "@/lib/format";

const ACCESS: CloudAccess[] = ["allowed", "approved_providers", "explicit_permission", "prohibited"];
const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "google", label: "Google" },
];

function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative h-[18px] w-8 shrink-0 rounded-full transition-colors disabled:opacity-50", checked ? "bg-local" : "bg-surface-3 ring-1 ring-line-strong")}
    >
      <span className={cn("absolute top-[2px] size-[14px] rounded-full bg-white shadow transition-[left]", checked ? "left-[16px]" : "left-[2px]")} />
    </button>
  );
}

export type ModelLite = Pick<ModelDescriptor, "id" | "shortName" | "local" | "providerId" | "privacyEligibility" | "location">;

const GUARDRAILS = [
  ["Fail closed", "If policy requires local execution and the local provider is down, the request is blocked, never sent to the cloud."],
  ["No cross-boundary fallback", "Fallback chains contain only models that already passed governance for the request's classification."],
  ["Classification only goes up", "A declared label can raise the detected level, never lower it below what the scanner found."],
  ["Restricted stays local", "Restricted data is local-only and its outputs always require human review."],
  ["Credentials escalate", "Detected API keys, tokens or private keys make a request Restricted and are redacted from traces."],
  ["Two-key live mode", "Paid calls need AI_LIVE_MODE=true and DEFAULT_PROVIDER=live, plus a worst-case budget reservation per call."],
];

export function PolicyEditor({ initial, models, readOnly = false }: { initial: GovernancePolicy; models: ModelLite[]; readOnly?: boolean }) {
  const [policy, setPolicy] = useState<GovernancePolicy>(initial);
  const [saved, setSaved] = useState<GovernancePolicy>(initial);
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; issues?: string[] }>({ kind: "idle" });
  const dirty = JSON.stringify(policy) !== JSON.stringify(saved);
  const issues = useMemo(() => validatePolicy(policy), [policy]);

  const setRule = (c: DataClassification, patch: Partial<GovernancePolicy["rules"][DataClassification]>) =>
    setPolicy((p) => ({ ...p, rules: { ...p.rules, [c]: { ...p.rules[c], ...patch } } }));

  const save = async () => {
    setState({ kind: "saving" });
    const res = await fetch("/api/policy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(policy) });
    const data = await res.json();
    if (!res.ok) return setState({ kind: "error", issues: data.issues ?? [data.error] });
    setPolicy(data.policy);
    setSaved(data.policy);
    setState({ kind: "saved" });
  };

  const reset = async () => {
    const res = await fetch("/api/policy", { method: "DELETE" });
    const data = await res.json();
    setPolicy(data.policy);
    setSaved(data.policy);
    setState({ kind: "saved" });
  };

  return (
    <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
    <div className="space-y-4">
      {readOnly ? (
        <div className="hatch flex items-start gap-2 rounded-lg border border-warn/30 px-3.5 py-2.5 text-xs text-fg-2">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-warn-fg" />
          <span>
            <span className="font-medium text-fg">Read-only in the portfolio demo.</span> These are the policies every request on this site is routed under; the
            effective-access matrix below is computed live by the same function the router uses. Editing works on a local install and is rejected server-side
            here.
          </span>
        </div>
      ) : null}
      <Panel>
        <PanelHeader
          title="Data classification policy"
          description={`Version ${saved.version} · applies to every routing decision, comparison run and fallback`}
          icon={<ShieldCheck className="size-4" />}
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={reset}>
                <RotateCcw className="size-3.5" /> Defaults
              </Button>
              <Button size="sm" variant="primary" disabled={!dirty || issues.length > 0 || state.kind === "saving"} onClick={save}>
                {state.kind === "saved" && !dirty ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
                {state.kind === "saved" && !dirty ? "Saved" : "Save policy"}
              </Button>
            </>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-3">
                <th className="px-4 py-2 font-normal">Classification</th>
                <th className="px-2 py-2 font-normal">Cloud access</th>
                <th className="px-2 py-2 font-normal">Approved cloud providers</th>
                <th className="px-2 py-2 font-normal">Prefer local</th>
                <th className="px-4 py-2 font-normal">Human review</th>
              </tr>
            </thead>
            <tbody>
              {CLASSIFICATIONS.map((c) => {
                const rule = policy.rules[c];
                const locked = c === "restricted";
                return (
                  <tr key={c} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <ClassificationBadge value={c} />
                    </td>
                    <td className="px-2 py-3">
                      <select
                        value={rule.cloudAccess}
                        disabled={locked}
                        onChange={(e) => setRule(c, { cloudAccess: e.target.value as CloudAccess })}
                        className="h-8 rounded-md border border-line bg-surface-2 px-2 text-xs text-fg focus:border-line-strong focus:outline-none disabled:opacity-60"
                      >
                        {ACCESS.map((a) => (
                          <option key={a} value={a}>
                            {CLOUD_ACCESS_LABEL[a]}
                          </option>
                        ))}
                      </select>
                      {locked ? <Lock className="ml-2 inline size-3 text-fg-4" /> : null}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex gap-1.5">
                        {PROVIDERS.map((p) => {
                          const on = rule.approvedProviders.includes(p.id);
                          const irrelevant = rule.cloudAccess === "prohibited" || rule.cloudAccess === "allowed";
                          return (
                            <button
                              key={p.id}
                              type="button"
                              disabled={irrelevant}
                              onClick={() => setRule(c, { approvedProviders: on ? rule.approvedProviders.filter((x) => x !== p.id) : [...rule.approvedProviders, p.id] })}
                              className={cn(
                                "h-6 rounded-[5px] border px-2 text-xs transition-colors disabled:opacity-40",
                                on ? "border-cloud-line bg-cloud-soft text-cloud-fg" : "border-line text-fg-3 hover:text-fg",
                              )}
                            >
                              {p.label}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <Toggle label={`Prefer local for ${c}`} checked={rule.preferLocal} disabled={locked} onChange={(v) => setRule(c, { preferLocal: v })} />
                    </td>
                    <td className="px-4 py-3">
                      <Toggle label={`Human review for ${c}`} checked={rule.requireHumanReview} disabled={locked} onChange={(v) => setRule(c, { requireHumanReview: v })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {issues.length || state.kind === "error" ? (
          <div className="border-t border-line px-4 py-2.5 text-xs text-danger-fg">{[...issues, ...(state.issues ?? [])].join(" · ")}</div>
        ) : null}
      </Panel>

      <Panel>
        <PanelHeader title="Effective access" description="Computed live from the policy above with the same function the router uses" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-3">
                <th className="px-4 py-2 font-normal">Data</th>
                {models.map((m) => (
                  <th key={m.id} className="px-2 py-2 font-normal">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full" style={{ background: m.local ? "var(--local)" : "var(--cloud)" }} />
                      {m.shortName}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CLASSIFICATIONS.map((c) => (
                <tr key={c} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5">
                    <ClassificationBadge value={c} size="xs" />
                  </td>
                  {models.map((m) => {
                    const plain = evaluatePolicy(m as ModelDescriptor, c, policy);
                    const withPermission = evaluatePolicy(m as ModelDescriptor, c, policy, { granted: true, justification: "preview" });
                    const reason = plain.reasons[0]?.message ?? "";
                    return (
                      <td key={m.id} className="px-2 py-2.5">
                        <Tip content={reason}>
                          {plain.allowed ? (
                            <span className={cn("inline-flex items-center gap-1 text-xs", m.local ? "text-local-fg" : "text-cloud-fg")}>
                              <Check className="size-3.5" /> Allowed
                            </span>
                          ) : withPermission.allowed ? (
                            <span className="inline-flex items-center gap-1 text-xs text-warn-fg">
                              <KeyRound className="size-3.5" /> With permission
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-blocked-fg">
                              <Lock className="size-3.5" /> Blocked
                            </span>
                          )}
                        </Tip>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Human review rules" />
          <div className="divide-y divide-line">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <div className="text-sm text-fg">Minimum evaluation estimate</div>
                <div className="text-xs text-fg-3">Outputs scoring below this go to human review</div>
              </div>
              <input
                type="number"
                min={0}
                max={100}
                value={policy.humanReview.minEvaluationScore}
                onChange={(e) => setPolicy((p) => ({ ...p, humanReview: { ...p.humanReview, minEvaluationScore: Number(e.target.value) } }))}
                className="tnum h-8 w-20 rounded-md border border-line bg-surface-2 px-2 text-right text-sm text-fg focus:border-line-strong focus:outline-none"
              />
            </div>
            {(
              [
                ["onHighBusinessRisk", "Review high business-risk output", "Customer-facing, legal, regulated or press audiences"],
                ["onQualityThresholdMiss", "Review threshold misses", "When no eligible model reached the quality requirement"],
                ["onFallback", "Review fallback executions", "When a provider failed and a fallback model served the request"],
              ] as const
            ).map(([key, title, sub]) => (
              <div key={key} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <div className="text-sm text-fg">{title}</div>
                  <div className="text-xs text-fg-3">{sub}</div>
                </div>
                <Toggle label={title} checked={policy.humanReview[key]} onChange={(v) => setPolicy((p) => ({ ...p, humanReview: { ...p.humanReview, [key]: v } }))} />
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Guardrails" description="Enforced in code; not editable here" />
          <ul className="divide-y divide-line">
            {GUARDRAILS.map(([t, d]) => (
              <li key={t} className="flex gap-3 px-4 py-2.5">
                <Lock className="mt-0.5 size-3.5 shrink-0 text-fg-4" />
                <div>
                  <div className="text-sm text-fg">{t}</div>
                  <div className="text-xs text-fg-3">{d}</div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <p className="text-xs text-fg-4">Changes take effect on the next routing decision. Each request&apos;s decision snapshot records the policy version that produced it.</p>
    </div>
    </fieldset>
  );
}
