import type { Reason } from "@/core/types";
import type { DB } from "../db/database";
import type { ExecutionRepository } from "../observability/repository";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Approval {
  id: string;
  executionId: string;
  createdAt: string;
  status: ApprovalStatus;
  reasons: Reason[];
  decidedAt: string | null;
  reviewer: string | null;
  note: string | null;
}

type Row = Record<string, unknown>;

const toApproval = (r: Row): Approval => ({
  id: r.id as string,
  executionId: r.execution_id as string,
  createdAt: r.created_at as string,
  status: r.status as ApprovalStatus,
  reasons: JSON.parse(r.reasons_json as string),
  decidedAt: (r.decided_at as string) ?? null,
  reviewer: (r.reviewer as string) ?? null,
  note: (r.note as string) ?? null,
});

/** Human review queue. Decisions are written back to the execution and its trace. */
export class ApprovalService {
  constructor(
    private readonly db: DB,
    private readonly executions: ExecutionRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  create(executionId: string, reasons: Reason[], createdAt: string, status: ApprovalStatus = "pending"): Approval {
    const id = `apr_${executionId.replace(/^exe_/, "")}`;
    this.db
      .prepare(`INSERT INTO approvals (id, execution_id, created_at, status, reasons_json) VALUES (?, ?, ?, ?, ?)`)
      .run(id, executionId, createdAt, status, JSON.stringify(reasons));
    return { id, executionId, createdAt, status, reasons, decidedAt: null, reviewer: null, note: null };
  }

  list(status?: ApprovalStatus): Approval[] {
    const rows = status
      ? this.db.prepare(`SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC`).all(status)
      : this.db.prepare(`SELECT * FROM approvals ORDER BY created_at DESC LIMIT 200`).all();
    return (rows as Row[]).map(toApproval);
  }

  get(id: string): Approval | null {
    const r = this.db.prepare(`SELECT * FROM approvals WHERE id = ?`).get(id) as Row | undefined;
    return r ? toApproval(r) : null;
  }

  forExecution(executionId: string): Approval | null {
    const r = this.db.prepare(`SELECT * FROM approvals WHERE execution_id = ?`).get(executionId) as Row | undefined;
    return r ? toApproval(r) : null;
  }

  pendingCount(): number {
    return (this.db.prepare(`SELECT COUNT(*) n FROM approvals WHERE status = 'pending'`).get() as { n: number }).n;
  }

  decide(id: string, decision: "approved" | "rejected", reviewer: string, note: string, decidedAt?: Date): Approval {
    const current = this.get(id);
    if (!current) throw new Error(`Approval ${id} not found`);
    if (current.status !== "pending") throw new Error(`Approval ${id} was already ${current.status}`);
    const at = (decidedAt ?? this.now()).toISOString();
    const cleanNote = note.trim().slice(0, 1000);
    this.db
      .prepare(`UPDATE approvals SET status = ?, decided_at = ?, reviewer = ?, note = ? WHERE id = ?`)
      .run(decision, at, reviewer, cleanNote || null, id);
    this.executions.setReviewStatus(current.executionId, decision);
    const exec = this.executions.get(current.executionId);
    if (exec) {
      const started = new Date(exec.createdAt).getTime();
      this.executions.appendTrace(current.executionId, {
        at,
        offsetMs: new Date(at).getTime() - started,
        stage: "review",
        level: decision === "approved" ? "success" : "warn",
        message: `Human review ${decision} by ${reviewer}`,
        detail: cleanNote || undefined,
      });
    }
    return { ...current, status: decision, decidedAt: at, reviewer, note: cleanNote || null };
  }
}
