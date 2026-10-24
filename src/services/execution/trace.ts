import type { TraceEvent, TraceLevel, TraceStage } from "@/core/types";
import { redact } from "@/core/security/redact";

/** Collects timestamped trace events. Detail strings pass through secret + PII redaction. */
export class TraceBuilder {
  readonly events: TraceEvent[] = [];

  constructor(
    private readonly startMs: number,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  add(stage: TraceStage, level: TraceLevel, message: string, detail?: string, simulated?: boolean): void {
    const t = this.clock();
    this.events.push({
      at: new Date(t).toISOString(),
      offsetMs: Math.max(0, t - this.startMs),
      stage,
      level,
      message: redact(message),
      ...(detail ? { detail: redact(detail) } : {}),
      ...(simulated ? { simulated: true } : {}),
    });
  }
}
