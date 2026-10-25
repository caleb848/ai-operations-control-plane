"use client";

import { ArrowRight, Ban, Check, KeyRound, Lock, RotateCcw, Save, ShieldBan } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { evaluatePolicy } from "@/core/governance/evaluate";
import { CLOUD_ACCESS_LABEL, validatePolicy } from "@/core/governance/policy";
import { CLASSIFICATIONS, type CloudAccess, type DataClassification, type GovernancePolicy, type ModelDescriptor, type ProviderId } from "@/core/types";
import { ClassificationChip, ClassificationIcon, DESTINATION_ICON, SensitivityPips } from "@/components/ui/badges";
import { Button, Tip } from "@/components/ui/primitives";
import { cn } from "@/lib/format";
import { CLASSIFICATION_META } from "@/lib/routing-view";

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
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-[var(--dur-fast)] disabled:opacity-50",
        checked ? "bg-fg" : "bg-surface-3 ring-1 ring-inset ring-line-strong",
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] size-[18px] rounded-full shadow transition-[left] duration-[var(--dur)] ease-[var(--ease-out)]",
          checked ? "left-[19px] bg-bg" : "left-[3px] bg-fg-3",
        )}
      />
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
  const [state, setState] = useState<{
    kind: "idle" | "saving" | "saved" | "error";
    issues?: string[];
  }>({ kind: "idle" });
  const dirty = JSON.stringify(policy) !== JSON.stringify(saved);
  const issues = useMemo(() => validatePolicy(policy), [policy]);

  const setRule = (c: DataClassification, patch: Partial<GovernancePolicy["rules"][DataClassification]>) =>
    setPolicy((p) => ({
      ...p,
      rules: { ...p.rules, [c]: { ...p.rules[c], ...patch } },
    }));

  const save = async () => {
    setState({ kind: "saving" });
    const res = await fetch("/api/policy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(policy),
    });
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

  const providers = (c: DataClassification) => policy.rules[c].approvedProviders.map((id) => PROVIDERS.find((p) => p.id === id)?.label ?? id).join(", ");
  const cloudLine = (c: DataClassification): { text: string; state: "yes" | "limited" | "no" } => {
    const r = policy.rules[c];
    if (r.cloudAccess === "allowed") return { text: "Allowed", state: "yes" };
    if (r.cloudAccess === "approved_providers")
      return {
        text: providers(c) ? `${providers(c)} only` : "No provider approved",
        state: providers(c) ? "limited" : "no",
      };
    if (r.cloudAccess === "explicit_permission") return { text: "Only with a justified exception", state: "limited" };
    return { text: "Never", state: "no" };
  };
  const field = "h-9 rounded-lg border border-line-strong bg-surface-2 px-2.5 text-sm text-fg focus:border-fg-3 focus:outline-none disabled:opacity-60";

  return (
    <div className="space-y-10">
      {readOnly ? (
        <p className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg-2">
          <Lock className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
          <span>
            <span className="font-medium text-fg">Read-only on this public site.</span> These are the policies every request here is routed under, and the access matrix is computed
            live by the same function the router uses. Editing works on a local install and is rejected server-side here.
          </span>
        </p>
      ) : null}

      <section aria-labelledby="ladder-title">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 id="ladder-title" className="text-xl font-semibold text-fg">
              The classification ladder
            </h2>
            <p className="mt-1 text-sm text-fg-3">The more sensitive the data, the fewer places it may go. Computed from policy v{saved.version}.</p>
          </div>
        </div>
        <ol className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:[--stair:28px]">
          {CLASSIFICATIONS.map((c, ci) => {
            const meta = CLASSIFICATION_META[c];
            const rule = policy.rules[c];
            const cloud = cloudLine(c);
            const rows: {
              dest: "local" | "cloud" | "review";
              text: string;
              state: "yes" | "limited" | "no";
            }[] = [
              {
                dest: "local",
                text: rule.preferLocal ? "Allowed, preferred" : "Allowed",
                state: "yes",
              },
              { dest: "cloud", ...cloud },
              {
                dest: "review",
                text: rule.requireHumanReview ? "Always" : "When risk or quality calls for it",
                state: rule.requireHumanReview ? "yes" : "limited",
              },
            ];
            return (
              <li
                key={c}
                className="card card-glow spotlight flex flex-col overflow-hidden p-5"
                style={{ "--glow": c === "restricted" ? "var(--blocked)" : c === "confidential" ? "var(--review)" : c === "internal" ? "var(--cloud)" : "var(--local)", marginTop: `calc(${3 - ci} * var(--stair, 0px))` } as CSSProperties}
              >
                <div className="flex items-start justify-between">
                  <span className="font-display text-5xl font-semibold leading-none text-fg-4">0{meta.level}</span>
                  <span className="icon-tile size-11" style={{ "--tone": "var(--brand)", "--tone-ink": "var(--brand-ink)" } as CSSProperties}>
                    <ClassificationIcon value={c} className="size-5" />
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="font-display text-2xl font-semibold text-fg">{meta.label}</span>
                  <SensitivityPips level={meta.level} className="text-brand-ink" />
                </div>
                <p className="mt-1 text-sm text-fg-3">{meta.blurb}</p>
                <div className="mt-4 h-1.5 rounded-full bg-track" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${meta.level * 25}%`, background: "var(--brand-gradient)", boxShadow: "0 0 12px var(--brand)" }} />
                </div>
                <ul className="mt-4 space-y-2.5 border-t border-line pt-4">
                  {rows.map((r) => {
                    const Icon = DESTINATION_ICON[r.dest];
                    return (
                      <li key={r.dest} className="flex items-start gap-2.5 text-sm">
                        <Icon className="mt-0.5 size-4 shrink-0" style={{ color: `var(--${r.dest}-ink)` }} strokeWidth={1.9} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="text-fg-3">{r.dest === "local" ? "Local AI" : r.dest === "cloud" ? "Cloud AI" : "Human review"}</span>{" "}
                          <span className={cn("font-medium", r.state === "no" ? "text-blocked-ink" : "text-fg")}>{r.text}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      </section>

      <section
        aria-labelledby="failclosed-title"
        className="card card-glow relative flex flex-wrap items-center gap-x-10 gap-y-6 overflow-hidden p-6 sm:p-9"
        style={{ "--glow": "var(--blocked)", background: "radial-gradient(80% 140% at 0% 50%, color-mix(in srgb, var(--blocked) 22%, transparent), transparent 60%), var(--surface)" } as CSSProperties}
      >
        <span className="relative flex size-24 shrink-0 items-center justify-center" aria-hidden>
          <span className="absolute inset-0 animate-[ping-soft_3s_var(--ease-out)_infinite] rounded-full bg-blocked/30" />
          <span className="absolute inset-3 rounded-full border border-blocked-line bg-blocked-soft" />
          <span className="relative flex size-14 items-center justify-center rounded-2xl text-white shadow-[0_0_34px_var(--blocked)]" style={{ background: "linear-gradient(140deg, color-mix(in srgb, var(--blocked) 70%, #fff), var(--blocked))" }}>
            <ShieldBan className="size-7" strokeWidth={1.9} />
          </span>
        </span>
        <div className="min-w-[260px] flex-1">
          <h2 id="failclosed-title" className="font-display text-3xl font-semibold text-fg">
            When the rules can&apos;t be met, nothing runs.
          </h2>
          <p className="mt-1 max-w-2xl text-md text-fg-2">
            If restricted data must stay local and no local model is available, the request is blocked rather than sent to the cloud. Failing closed is the policy working, not an
            error.
          </p>
        </div>
        <Link href="/route?scenario=restricted-local-offline" className="inline-flex items-center gap-1.5 text-md font-medium text-blocked-ink underline-offset-4 hover:underline">
          See it fail closed <ArrowRight className="size-4" />
        </Link>
      </section>

      <section aria-labelledby="policy-title" className="card">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 pb-4 pt-6 sm:px-6">
          <div>
            <h2 id="policy-title" className="text-xl font-semibold text-fg">
              Data classification policy
            </h2>
            <p className="mt-1 text-sm text-fg-3">Version {saved.version}. Applies to every routing decision, comparison run and fallback.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled={readOnly} onClick={reset}>
              <RotateCcw className="size-4" /> Defaults
            </Button>
            <Button variant="primary" disabled={readOnly || !dirty || issues.length > 0 || state.kind === "saving"} onClick={save}>
              {state.kind === "saved" && !dirty ? <Check className="size-4" /> : <Save className="size-4" />}
              {state.kind === "saved" && !dirty ? "Saved" : "Save policy"}
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto border-t border-line" tabIndex={0} aria-label="Policy rules">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-sm text-fg-3">
                <th className="px-6 py-3 font-normal">Classification</th>
                <th className="px-3 py-3 font-normal">Cloud access</th>
                <th className="px-3 py-3 font-normal">Approved cloud providers</th>
                <th className="px-3 py-3 font-normal">Prefer local</th>
                <th className="px-6 py-3 font-normal">Human review</th>
              </tr>
            </thead>
            <tbody>
              {CLASSIFICATIONS.map((c) => {
                const rule = policy.rules[c];
                const locked = c === "restricted";
                const label = CLASSIFICATION_META[c].label;
                return (
                  <tr key={c} className="border-b border-line last:border-0">
                    <td className="px-6 py-3.5">
                      <ClassificationChip value={c} />
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="inline-flex items-center gap-2">
                        <select
                          aria-label={`Cloud access for ${label} data`}
                          value={rule.cloudAccess}
                          disabled={readOnly || locked}
                          onChange={(e) =>
                            setRule(c, {
                              cloudAccess: e.target.value as CloudAccess,
                            })
                          }
                          className={field}
                        >
                          {ACCESS.map((a) => (
                            <option key={a} value={a}>
                              {CLOUD_ACCESS_LABEL[a]}
                            </option>
                          ))}
                        </select>
                        {locked ? (
                          <Tip content="Restricted data is local-only; enforced in code">
                            <Lock className="size-3.5 text-fg-3" aria-label="Locked" />
                          </Tip>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex gap-1.5" role="group" aria-label={`Approved providers for ${label} data`}>
                        {PROVIDERS.map((p) => {
                          const on = rule.approvedProviders.includes(p.id);
                          const irrelevant = rule.cloudAccess === "prohibited" || rule.cloudAccess === "allowed";
                          return (
                            <button
                              key={p.id}
                              type="button"
                              aria-pressed={on}
                              disabled={readOnly || irrelevant}
                              onClick={() =>
                                setRule(c, {
                                  approvedProviders: on ? rule.approvedProviders.filter((x) => x !== p.id) : [...rule.approvedProviders, p.id],
                                })
                              }
                              className={cn(
                                "h-8 rounded-lg border px-2.5 text-sm transition-colors duration-[var(--dur-fast)] disabled:opacity-40",
                                on ? "border-fg-3 bg-surface-3 text-fg" : "border-line text-fg-3 hover:border-line-strong hover:text-fg",
                              )}
                            >
                              {p.label}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      <Toggle label={`Prefer local for ${label} data`} checked={rule.preferLocal} disabled={readOnly || locked} onChange={(v) => setRule(c, { preferLocal: v })} />
                    </td>
                    <td className="px-6 py-3.5">
                      <Toggle
                        label={`Human review for ${label} data`}
                        checked={rule.requireHumanReview}
                        disabled={readOnly || locked}
                        onChange={(v) => setRule(c, { requireHumanReview: v })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {issues.length || state.kind === "error" ? (
          <p role="alert" className="border-t border-line px-6 py-3 text-sm text-danger-ink">
            {[...issues, ...(state.issues ?? [])].join(" · ")}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="matrix-title" className="card">
        <div className="px-5 pb-4 pt-6 sm:px-6">
          <h2 id="matrix-title" className="text-xl font-semibold text-fg">
            Effective access
          </h2>
          <p className="mt-1 text-sm text-fg-3">Which model may receive which data, computed live with the same function the router uses.</p>
        </div>
        <div className="overflow-x-auto border-t border-line" tabIndex={0} aria-label="Effective access matrix">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-sm text-fg-3">
                <th className="px-6 py-3 font-normal">Data</th>
                {models.map((m) => (
                  <th key={m.id} className="px-3 py-3 font-normal">
                    <span className="inline-flex items-center gap-2 text-fg-2">
                      <span
                        className="size-2 rounded-full"
                        style={{
                          background: m.local ? "var(--local)" : "var(--cloud)",
                        }}
                        aria-hidden
                      />
                      {m.shortName}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CLASSIFICATIONS.map((c) => (
                <tr key={c} className="border-b border-line last:border-0">
                  <td className="px-6 py-3">
                    <ClassificationChip value={c} size="xs" />
                  </td>
                  {models.map((m) => {
                    const plain = evaluatePolicy(m as ModelDescriptor, c, policy);
                    const withPermission = evaluatePolicy(m as ModelDescriptor, c, policy, { granted: true, justification: "preview" });
                    const reason = plain.reasons[0]?.message ?? "";
                    return (
                      <td key={m.id} className="px-3 py-3">
                        <Tip content={reason}>
                          {plain.allowed ? (
                            <span className="inline-flex items-center gap-1.5 text-fg">
                              <Check className="size-4" aria-hidden /> Allowed
                            </span>
                          ) : withPermission.allowed ? (
                            <span className="inline-flex items-center gap-1.5 text-review-ink">
                              <KeyRound className="size-4" aria-hidden /> With exception
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-blocked-ink">
                              <Ban className="size-4" aria-hidden /> Blocked
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
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="review-rules-title" className="card p-6">
          <h2 id="review-rules-title" className="text-xl font-semibold text-fg">
            Human review rules
          </h2>
          <p className="mt-1 text-sm text-fg-3">When an output waits for a person before anyone uses it.</p>
          <div className="mt-5 divide-y divide-line">
            <div className="flex items-center justify-between gap-4 pb-4">
              <div>
                <label htmlFor="min-eval" className="text-md text-fg">
                  Minimum evaluation estimate
                </label>
                <div className="text-sm text-fg-3">Outputs scoring below this go to human review</div>
              </div>
              <input
                id="min-eval"
                type="number"
                min={0}
                max={100}
                value={policy.humanReview.minEvaluationScore}
                disabled={readOnly}
                onChange={(e) =>
                  setPolicy((p) => ({
                    ...p,
                    humanReview: {
                      ...p.humanReview,
                      minEvaluationScore: Number(e.target.value),
                    },
                  }))
                }
                className="tnum h-10 w-20 rounded-lg border border-line-strong bg-surface-2 px-3 text-right text-md text-fg focus:border-fg-3 focus:outline-none"
              />
            </div>
            {(
              [
                ["onHighBusinessRisk", "Review high business-risk output", "Customer-facing, legal, regulated or press audiences"],
                ["onQualityThresholdMiss", "Review threshold misses", "When no eligible model reached the quality requirement"],
                ["onFallback", "Review fallback executions", "When a provider failed and a fallback model served the request"],
              ] as const
            ).map(([key, title, sub]) => (
              <div key={key} className="flex items-center justify-between gap-4 py-4 last:pb-0">
                <div>
                  <div className="text-md text-fg">{title}</div>
                  <div className="text-sm text-fg-3">{sub}</div>
                </div>
                <Toggle
                  label={title}
                  checked={policy.humanReview[key]}
                  disabled={readOnly}
                  onChange={(v) =>
                    setPolicy((p) => ({
                      ...p,
                      humanReview: { ...p.humanReview, [key]: v },
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </section>
        <section aria-labelledby="guardrails-title" className="card p-6">
          <h2 id="guardrails-title" className="text-xl font-semibold text-fg">
            Guardrails
          </h2>
          <p className="mt-1 text-sm text-fg-3">Enforced in code, so no setting can turn them off.</p>
          <ul className="mt-5 space-y-4">
            {GUARDRAILS.map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-line-strong bg-surface-2 text-fg-2" aria-hidden>
                  <Lock className="size-3.5" />
                </span>
                <div>
                  <div className="text-md font-medium text-fg">{t}</div>
                  <div className="text-sm text-fg-3">{d}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <p className="text-sm text-fg-3">Changes take effect on the next routing decision. Each request&apos;s decision snapshot records the policy version that produced it.</p>
    </div>
  );
}
