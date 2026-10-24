import { Ban, Check, Cloud, FlaskConical, HardDrive, Lock, Radio, TriangleAlert, Unplug, Wallet, CircleSlash } from "lucide-react";
import type { ReactNode } from "react";
import type { CandidateStatus, DataClassification, ExecutionLocation, ExecutionMode } from "@/core/types";
import { cn } from "@/lib/format";

const base = "inline-flex shrink-0 items-center gap-1 rounded-[5px] border font-medium leading-none whitespace-nowrap";

export function Badge({ children, className, tone = "neutral", size = "sm" }: { children: ReactNode; className?: string; tone?: "neutral" | "local" | "cloud" | "blocked" | "warn" | "danger" | "ok"; size?: "xs" | "sm" }) {
  const tones = {
    neutral: "border-line bg-surface-2 text-fg-2",
    local: "border-local-line bg-local-soft text-local-fg",
    cloud: "border-cloud-line bg-cloud-soft text-cloud-fg",
    blocked: "border-blocked-line bg-blocked-soft text-blocked-fg",
    warn: "border-warn/35 bg-warn-soft text-warn-fg",
    danger: "border-danger/35 bg-danger-soft text-danger-fg",
    ok: "border-ok/30 bg-ok/10 text-ok-fg",
  } as const;
  return <span className={cn(base, size === "xs" ? "h-[18px] px-1.5 text-2xs" : "h-5 px-1.5 text-xs", tones[tone], className)}>{children}</span>;
}

/** Always-visible execution mode. DEMO output is simulated, LOCAL is real on-device inference, LIVE API is a paid call. */
export function ModeBadge({ mode, size = "sm" }: { mode: ExecutionMode | null | "blocked" | "failed"; size?: "xs" | "sm" }) {
  if (mode === "local")
    return (
      <Badge tone="local" size={size} className="font-semibold tracking-[0.04em]">
        <HardDrive className="size-3" /> LOCAL
      </Badge>
    );
  if (mode === "live")
    return (
      <Badge tone="cloud" size={size} className="font-semibold tracking-[0.04em]">
        <Radio className="size-3" /> LIVE API
      </Badge>
    );
  if (mode === "demo")
    return (
      <Badge tone="warn" size={size} className="font-semibold tracking-[0.04em]">
        <FlaskConical className="size-3" /> DEMO
      </Badge>
    );
  if (mode === "failed")
    return (
      <Badge tone="danger" size={size} className="font-semibold tracking-[0.04em]">
        <Unplug className="size-3" /> FAILED
      </Badge>
    );
  return (
    <Badge tone="blocked" size={size} className="font-semibold tracking-[0.04em]">
      <Ban className="size-3" /> BLOCKED
    </Badge>
  );
}

const CLS: Record<DataClassification, { label: string; color: string }> = {
  public: { label: "Public", color: "var(--cls-public)" },
  internal: { label: "Internal", color: "var(--cls-internal)" },
  confidential: { label: "Confidential", color: "var(--cls-confidential)" },
  restricted: { label: "Restricted", color: "var(--cls-restricted)" },
};

export function ClassificationBadge({ value, size = "sm", upper }: { value: DataClassification; size?: "xs" | "sm"; upper?: boolean }) {
  const c = CLS[value];
  return (
    <span
      className={cn(base, size === "xs" ? "h-[18px] px-1.5 text-2xs" : "h-5 px-1.5 text-xs", upper && "uppercase tracking-[0.05em]")}
      style={{ color: c.color, borderColor: `color-mix(in srgb, ${c.color} 40%, transparent)`, background: `color-mix(in srgb, ${c.color} 10%, transparent)` }}
    >
      {value === "restricted" || value === "confidential" ? <Lock className="size-[11px]" /> : <span className="size-1.5 rounded-full" style={{ background: c.color }} />}
      {c.label}
    </span>
  );
}

export function LocationChip({ location, size = "sm" }: { location: ExecutionLocation | null; size?: "xs" | "sm" }) {
  if (!location) return <span className="text-fg-4">—</span>;
  return location === "local" ? (
    <Badge tone="local" size={size}>
      <HardDrive className="size-3" /> Local
    </Badge>
  ) : (
    <Badge tone="cloud" size={size}>
      <Cloud className="size-3" /> Cloud
    </Badge>
  );
}

export const CANDIDATE_STATUS: Record<CandidateStatus, { label: string; tone: "local" | "cloud" | "blocked" | "warn" | "danger" | "neutral" | "ok"; icon: ReactNode }> = {
  selected: { label: "Selected", tone: "ok", icon: <Check className="size-3" strokeWidth={2.5} /> },
  eligible: { label: "Eligible", tone: "neutral", icon: <Check className="size-3" /> },
  below_threshold: { label: "Below threshold", tone: "warn", icon: <TriangleAlert className="size-3" /> },
  over_budget: { label: "Over budget", tone: "warn", icon: <Wallet className="size-3" /> },
  blocked_policy: { label: "Blocked by policy", tone: "blocked", icon: <Lock className="size-3" /> },
  unavailable: { label: "Unavailable", tone: "danger", icon: <Unplug className="size-3" /> },
  context_exceeded: { label: "Context too small", tone: "warn", icon: <CircleSlash className="size-3" /> },
  disabled: { label: "Disabled", tone: "neutral", icon: <CircleSlash className="size-3" /> },
};

export function CandidateStatusBadge({ status, location }: { status: CandidateStatus; location: ExecutionLocation }) {
  const s = CANDIDATE_STATUS[status];
  const tone = status === "selected" ? (location === "local" ? "local" : "cloud") : s.tone;
  return (
    <Badge tone={tone} className={cn(status === "selected" && "font-semibold uppercase tracking-[0.05em]")}>
      {s.icon}
      {s.label}
    </Badge>
  );
}

export function StatusDot({ status, pulse }: { status: "online" | "offline" | "warn" | "idle"; pulse?: boolean }) {
  const color = { online: "var(--ok)", offline: "var(--danger)", warn: "var(--warn)", idle: "var(--fg-4)" }[status];
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", pulse && status === "online" && "animate-pulse-dot")}
      style={{ background: color, color }}
      aria-hidden
    />
  );
}
