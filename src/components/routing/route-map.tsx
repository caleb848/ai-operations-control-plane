import { Ban, Check, Cloud, FileText, HardDrive, Lock, ScanSearch, ShieldCheck, TriangleAlert, Unplug, Wallet, CircleSlash, X } from "lucide-react";
import type { ReactNode } from "react";
import { COMPLEXITY_LABEL, taskTypeLabel } from "@/core/classification/classify";
import { CLOUD_ACCESS_LABEL } from "@/core/governance/policy";
import { CLASSIFICATION_LABEL } from "@/core/security/classification";
import type { CandidateEvaluation, DataClassification, RoutingDecision } from "@/core/types";
import { cn, formatTokens, formatUsd } from "@/lib/format";

const CLS_COLOR: Record<DataClassification, string> = {
  public: "var(--cls-public)",
  internal: "var(--cls-internal)",
  confidential: "var(--cls-confidential)",
  restricted: "var(--cls-restricted)",
};

function Step({ label, icon, title, sub, accent }: { label: string; icon: ReactNode; title: ReactNode; sub: ReactNode; accent?: string }) {
  return (
    <div
      className="min-w-0 rounded-md border border-line bg-surface-2 px-3 py-2"
      style={accent ? { borderColor: `color-mix(in srgb, ${accent} 45%, transparent)`, background: `color-mix(in srgb, ${accent} 8%, var(--surface-2))` } : undefined}
    >
      <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.08em] text-fg-3">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-medium text-fg" style={accent ? { color: accent } : undefined}>
        {title}
      </div>
      <div className="truncate text-xs text-fg-3">{sub}</div>
    </div>
  );
}

function Arrow() {
  return (
    <svg className="mx-auto shrink-0" width="18" height="10" viewBox="0 0 18 10" aria-hidden>
      <path d="M0 5 H15" stroke="var(--line-strong)" strokeWidth="1.5" />
      <path d="M11.5 1.5 L15.5 5 L11.5 8.5" stroke="var(--line-strong)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const PILL_ICON: Record<CandidateEvaluation["status"], ReactNode> = {
  selected: <Check className="size-3" strokeWidth={3} />,
  eligible: <Check className="size-3" />,
  below_threshold: <TriangleAlert className="size-3" />,
  over_budget: <Wallet className="size-3" />,
  blocked_policy: <Lock className="size-3" />,
  unavailable: <Unplug className="size-3" />,
  context_exceeded: <CircleSlash className="size-3" />,
  disabled: <CircleSlash className="size-3" />,
};

function Pill({ c }: { c: CandidateEvaluation }) {
  const selected = c.status === "selected";
  const showScore = (c.status === "selected" || c.status === "eligible") && c.routingScore != null;
  const lane = c.location === "local" ? "local" : "cloud";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-[5px] border px-2 text-xs font-medium",
        selected && lane === "local" && "border-transparent bg-local text-white",
        selected && lane === "cloud" && "border-transparent bg-cloud text-white",
        c.status === "eligible" && "border-line-strong bg-surface text-fg",
        (c.status === "below_threshold" || c.status === "over_budget") && "border-warn/35 bg-warn-soft text-warn-fg",
        c.status === "blocked_policy" && "border-blocked-line bg-surface text-fg-3",
        c.status === "unavailable" && "border-danger/35 bg-surface text-danger-fg",
        (c.status === "disabled" || c.status === "context_exceeded") && "border-line bg-surface text-fg-4",
      )}
      title={c.reasons.find((r) => r.severity === "block" || r.severity === "warn")?.message ?? c.displayName}
    >
      <span className={cn(c.status === "blocked_policy" && "text-blocked-fg")}>{PILL_ICON[c.status]}</span>
      <span className={cn(c.status === "blocked_policy" && "line-through decoration-blocked/70")}>{c.shortName}</span>
      {showScore ? <span className={cn("tnum", selected ? "text-white/80" : "text-fg-3")}>{Math.round(c.routingScore!)}</span> : null}
    </span>
  );
}

type LaneState = "selected" | "open" | "blocked" | "down" | "weak" | "budget" | "empty";

function laneState(cands: CandidateEvaluation[]): LaneState {
  if (!cands.length) return "empty";
  if (cands.some((c) => c.status === "selected")) return "selected";
  if (cands.every((c) => c.status === "blocked_policy")) return "blocked";
  if (cands.every((c) => c.status === "unavailable" || c.status === "disabled")) return "down";
  if (cands.some((c) => c.status === "eligible")) return "open";
  if (cands.every((c) => c.status === "over_budget" || c.status === "blocked_policy" || c.status === "disabled")) return "budget";
  return "weak";
}

const LANE_STATUS: Record<LaneState, { text: string; cls: string; icon?: ReactNode }> = {
  selected: { text: "Selected", cls: "" },
  open: { text: "Eligible, not selected", cls: "text-fg-3" },
  blocked: { text: "Blocked by policy", cls: "text-blocked-fg", icon: <Ban className="size-3" /> },
  down: { text: "Unavailable", cls: "text-danger-fg", icon: <Unplug className="size-3" /> },
  weak: { text: "Below quality threshold", cls: "text-warn-fg", icon: <TriangleAlert className="size-3" /> },
  budget: { text: "Over budget", cls: "text-warn-fg", icon: <Wallet className="size-3" /> },
  empty: { text: "No models registered", cls: "text-fg-4" },
};

function Lane({ kind, cands, state, note }: { kind: "local" | "cloud"; cands: CandidateEvaluation[]; state: LaneState; note: string }) {
  const isLocal = kind === "local";
  const st = LANE_STATUS[state];
  return (
    <div
      className={cn(
        "relative min-w-0 rounded-md border px-3 pb-2.5 pt-2",
        state === "selected" && isLocal && "border-local-line bg-local-soft",
        state === "selected" && !isLocal && "border-cloud-line bg-cloud-soft",
        state === "blocked" && "border-dashed border-blocked-line bg-blocked-soft",
        state === "down" && "border-dashed border-danger/40 bg-danger-soft",
        (state === "open" || state === "weak" || state === "budget" || state === "empty") && "border-line bg-surface-2",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-2">
          {isLocal ? <HardDrive className="size-3.5 text-local-fg" /> : <Cloud className="size-3.5 text-cloud-fg" />}
          {isLocal ? "Local lane" : "Cloud lane"}
        </div>
        <span className={cn("inline-flex items-center gap-1 text-2xs font-medium", st.cls || (isLocal ? "text-local-fg" : "text-cloud-fg"))}>
          {st.icon}
          {st.text}
        </span>
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
        {cands.map((c) => (
          <Pill key={c.modelId} c={c} />
        ))}
      </div>
      <div className="mt-2 truncate text-2xs text-fg-3">{note}</div>
    </div>
  );
}

function branchStyle(s: LaneState, color: string) {
  if (s === "selected") return { stroke: color, dash: undefined, width: 2 };
  if (s === "blocked") return { stroke: "var(--blocked)", dash: "4 3", width: 1.5 };
  if (s === "down") return { stroke: "var(--danger)", dash: "4 3", width: 1.5 };
  return { stroke: "var(--line-strong)", dash: undefined, width: 1.5 };
}

/**
 * Policy gate → lanes connector. SVG percentage coordinates keep the lines
 * crisp at any width: the stem drops from the policy step (~83%) and
 * branches to the centers of the two lanes (~25% / ~75%).
 */
function Branches({ local, cloud }: { local: LaneState; cloud: LaneState }) {
  const L = branchStyle(local, "var(--local)");
  const C = branchStyle(cloud, "var(--cloud)");
  const stem = "83.6%";
  const lx = "24.6%";
  const cx = "75.4%";
  return (
    <div className="relative hidden h-7 md:block" aria-hidden>
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <line x1={stem} y1="0" x2={stem} y2="12" stroke="var(--line-strong)" strokeWidth="1.5" />
        <line x1={stem} y1="12" x2={lx} y2="12" stroke={L.stroke} strokeWidth={L.width} strokeDasharray={L.dash} />
        <line x1={lx} y1="12" x2={lx} y2="28" stroke={L.stroke} strokeWidth={L.width} strokeDasharray={L.dash} />
        <line x1={stem} y1="12" x2={cx} y2="12" stroke={C.stroke} strokeWidth={C.width} strokeDasharray={C.dash} />
        <line x1={cx} y1="12" x2={cx} y2="28" stroke={C.stroke} strokeWidth={C.width} strokeDasharray={C.dash} />
        <circle cx={stem} cy="12" r="2.5" fill="var(--fg-3)" />
      </svg>
      {cloud === "blocked" || cloud === "down" ? <Barrier left="79.5%" danger={cloud === "down"} /> : null}
      {local === "blocked" || local === "down" ? <Barrier left="54%" danger={local === "down"} /> : null}
    </div>
  );
}

function Barrier({ left, danger }: { left: string; danger?: boolean }) {
  return (
    <span
      className={cn("absolute top-[12px] flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white", danger ? "bg-danger" : "bg-blocked")}
      style={{ left }}
    >
      <X className="size-2.5" strokeWidth={3.5} />
    </span>
  );
}

export function RouteMap({ decision }: { decision: RoutingDecision }) {
  const p = decision.profile;
  const local = decision.candidates.filter((c) => c.location === "local");
  const cloud = decision.candidates.filter((c) => c.location === "cloud");
  const ls = laneState(local);
  const cs = laneState(cloud);
  const clsColor = CLS_COLOR[p.classification];
  const findings = p.findings.length;
  const cloudCosts = cloud.map((c) => c.cost.costUsd).sort((a, b) => a - b);
  const costRange = cloudCosts.length ? (cloudCosts.length > 1 ? `${formatUsd(cloudCosts[0])}–${formatUsd(cloudCosts.at(-1)!)}` : formatUsd(cloudCosts[0])) : "";

  const downReason = local.find((c) => c.status === "unavailable")?.reasons.find((r) => r.code === "unavailable")?.message;
  const localNote =
    ls === "down" ? (downReason ?? "Ollama unreachable") : local.length ? `On-device · $0.00 external API cost · ${local.length} model${local.length > 1 ? "s" : ""}` : "Install a model with ollama pull";
  const cloudNote =
    cs === "blocked"
      ? `Would leave the device · ${costRange} if permitted`
      : cloud.length
        ? `Leaves the device · est. ${costRange} per request`
        : "No cloud models configured";

  return (
    <div>
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)_18px_minmax(0,1fr)] sm:gap-1.5">
        <Step label="Request" icon={<FileText className="size-3" />} title={taskTypeLabel(p.taskType)} sub={`${COMPLEXITY_LABEL[p.complexity]} complexity · ~${formatTokens(p.estimatedInputTokens)} tokens`} />
        <span className="hidden sm:block">
          <Arrow />
        </span>
        <Step
          label="Classifier"
          icon={<ScanSearch className="size-3" />}
          title={CLASSIFICATION_LABEL[p.classification]}
          sub={findings ? `${findings} sensitivity finding${findings > 1 ? "s" : ""}` : p.declaredClassification ? "as declared · no findings" : "unlabeled → internal"}
          accent={p.classification === "confidential" || p.classification === "restricted" ? clsColor : undefined}
        />
        <span className="hidden sm:block">
          <Arrow />
        </span>
        <Step
          label="Policy gate"
          icon={<ShieldCheck className="size-3" />}
          title={decision.rule.cloudAccess === "prohibited" ? "Local only" : decision.rule.preferLocal ? "Prefer local" : "Local or cloud"}
          sub={CLOUD_ACCESS_LABEL[decision.rule.cloudAccess]}
        />
      </div>
      <Branches local={ls} cloud={cs} />
      <div className="mt-2 grid grid-cols-1 gap-3 md:mt-0 md:grid-cols-2">
        <Lane kind="local" cands={local} state={ls} note={localNote} />
        <Lane kind="cloud" cands={cloud} state={cs} note={cloudNote} />
      </div>
    </div>
  );
}
