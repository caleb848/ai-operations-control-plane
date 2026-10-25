import { Building2, Cloud, FlaskConical, Globe, History, Laptop, Lock, LockKeyhole, Radio, ShieldBan, Unplug, UserRoundCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { CandidateStatus, DataClassification, ExecutionLocation, ExecutionMode } from "@/core/types";
import { cn } from "@/lib/format";
import { CANDIDATE_LABEL, CLASSIFICATION_META, DESTINATION, type Destination } from "@/lib/routing-view";

/*
 * Three badge families:
 *   destination   semantic tint + icon, always labeled (color is never the only cue)
 *   classification neutral ink + icon + sensitivity pips
 *   mode tag      compact mono label for how output was produced
 */

export const DESTINATION_ICON: Record<Destination, LucideIcon> = { local: Laptop, cloud: Cloud, review: UserRoundCheck, blocked: ShieldBan };

const TONE: Record<Destination | "neutral" | "danger", string> = {
  local: "border-local-line bg-local-soft text-local-ink",
  cloud: "border-cloud-line bg-cloud-soft text-cloud-ink",
  review: "border-review-line bg-review-soft text-review-ink",
  blocked: "border-blocked-line bg-blocked-soft text-blocked-ink",
  neutral: "border-line-strong bg-surface-2 text-fg-2",
  danger: "border-danger-line bg-danger-soft text-danger-ink",
};

const base = "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-medium leading-none";
const SIZE = { xs: "h-5 px-1.5 text-xs [&_svg]:size-3", sm: "h-6 px-2 text-xs [&_svg]:size-3.5", md: "h-7 px-2.5 text-sm [&_svg]:size-4" };

export function Badge({ children, className, tone = "neutral", size = "sm" }: { children: ReactNode; className?: string; tone?: keyof typeof TONE | "warn" | "ok"; size?: keyof typeof SIZE }) {
  const t = tone === "warn" ? "review" : tone === "ok" ? "neutral" : tone;
  return <span className={cn(base, SIZE[size], TONE[t], className)}>{children}</span>;
}

export function DestinationBadge({ destination, size = "sm", label, className }: { destination: Destination; size?: keyof typeof SIZE; label?: ReactNode; className?: string }) {
  const Icon = DESTINATION_ICON[destination];
  return (
    <span className={cn(base, SIZE[size], TONE[destination], className)}>
      <Icon strokeWidth={2} aria-hidden />
      {label ?? DESTINATION[destination].short}
    </span>
  );
}

/** A small dot plus label, for dense rows where a full badge is too heavy. */
export function DestinationDot({ destination, label, className }: { destination: Destination; label?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap", className)}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--${destination})` }} aria-hidden />
      {label ?? DESTINATION[destination].short}
    </span>
  );
}

export function SensitivityPips({ level, className }: { level: 1 | 2 | 3 | 4; className?: string }) {
  return (
    <span className={cn("inline-flex items-end gap-[2px]", className)} aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={cn("w-[3px] rounded-[1px]", i <= level ? "bg-current" : "bg-current opacity-20")} style={{ height: 4 + i * 2 }} />
      ))}
    </span>
  );
}

const CLS_ICON: Record<DataClassification, LucideIcon> = { public: Globe, internal: Building2, confidential: Lock, restricted: LockKeyhole };

export function ClassificationChip({ value, size = "sm", className }: { value: DataClassification; size?: keyof typeof SIZE; className?: string }) {
  const m = CLASSIFICATION_META[value];
  const Icon = CLS_ICON[value];
  return (
    <span className={cn(base, SIZE[size], "border-line-strong bg-surface-2", m.level >= 3 ? "text-fg" : "text-fg-2", className)} title={`${m.label}: ${m.reach}`}>
      <Icon strokeWidth={2} aria-hidden />
      {m.label}
      <SensitivityPips level={m.level} className="ml-0.5 text-fg-3" />
    </span>
  );
}

/** v1 name. `upper` is accepted for compatibility; classification is never shouted. */
export function ClassificationBadge({ value, size = "sm" }: { value: DataClassification; size?: "xs" | "sm"; upper?: boolean }) {
  return <ClassificationChip value={value} size={size} />;
}

export function ClassificationIcon({ value, className }: { value: DataClassification; className?: string }) {
  const Icon = CLS_ICON[value];
  return <Icon className={className} strokeWidth={2} aria-hidden />;
}

type Mode = ExecutionMode | "blocked" | "failed" | "recorded" | null;

/** How an answer was produced. Simulated output is always marked so it can't be mistaken for model output. */
export function ModeTag({ mode, size = "sm" }: { mode: Mode; size?: "xs" | "sm" }) {
  const s = size === "xs" ? "h-5 px-1.5 text-[11px] [&_svg]:size-3" : "h-6 px-2 text-[11.5px] [&_svg]:size-3.5";
  const m = {
    local: { tone: TONE.local, icon: <Laptop aria-hidden />, text: "Local" },
    live: { tone: TONE.cloud, icon: <Radio aria-hidden />, text: "Live API" },
    demo: { tone: TONE.neutral, icon: <FlaskConical aria-hidden />, text: "Simulated" },
    recorded: { tone: TONE.neutral, icon: <History aria-hidden />, text: "Recorded run" },
    failed: { tone: TONE.danger, icon: <Unplug aria-hidden />, text: "Failed" },
    blocked: { tone: TONE.blocked, icon: <ShieldBan aria-hidden />, text: "Blocked" },
  }[mode ?? "blocked"];
  return (
    <span className={cn(base, s, m.tone, "font-mono font-medium uppercase tracking-[0.04em]")}>
      {m.icon}
      {m.text}
    </span>
  );
}

/** v1 name. */
export function ModeBadge({ mode, size = "sm" }: { mode: Mode; size?: "xs" | "sm" }) {
  return <ModeTag mode={mode} size={size} />;
}

export function LocationChip({ location, size = "sm" }: { location: ExecutionLocation | null; size?: "xs" | "sm" }) {
  if (!location) return <span className="text-fg-3">—</span>;
  return <DestinationBadge destination={location} size={size} />;
}

const STATUS_TONE: Record<CandidateStatus, keyof typeof TONE> = {
  selected: "neutral",
  eligible: "neutral",
  below_threshold: "neutral",
  over_budget: "review",
  blocked_policy: "blocked",
  unavailable: "danger",
  context_exceeded: "neutral",
  disabled: "neutral",
};

export function CandidateStatusBadge({ status, location, size = "sm" }: { status: CandidateStatus; location: ExecutionLocation; size?: keyof typeof SIZE }) {
  if (status === "selected") return <DestinationBadge destination={location} size={size} label="Selected" />;
  return (
    <span className={cn(base, SIZE[size], TONE[STATUS_TONE[status]])}>
      {status === "blocked_policy" ? <Lock aria-hidden /> : status === "unavailable" ? <Unplug aria-hidden /> : null}
      {CANDIDATE_LABEL[status]}
    </span>
  );
}

export function StatusDot({ status, pulse }: { status: "online" | "offline" | "warn" | "idle"; pulse?: boolean }) {
  const color = { online: "var(--local)", offline: "var(--danger)", warn: "var(--review)", idle: "var(--fg-4)" }[status];
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", pulse && status === "online" && "animate-pulse-dot")} style={{ background: color, color }} aria-hidden />;
}
