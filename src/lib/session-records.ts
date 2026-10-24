import type { ExecutionRecord } from "@/services/observability/types";

/**
 * Keeps this visitor's recent executions in sessionStorage. The public demo
 * stores history in memory per server instance, so a later request may land on
 * an instance that never saw the execution; the request page falls back to this.
 */
const KEY = (id: string) => `aiops:exec:${id}`;

export function rememberRecord(rec: ExecutionRecord): void {
  try {
    sessionStorage.setItem(KEY(rec.id), JSON.stringify(rec));
  } catch {
    /* storage full or unavailable: the inline result still shows */
  }
}

export function recallRecord(id: string): ExecutionRecord | null {
  try {
    const raw = sessionStorage.getItem(KEY(id));
    return raw ? (JSON.parse(raw) as ExecutionRecord) : null;
  } catch {
    return null;
  }
}
