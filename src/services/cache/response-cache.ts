import { createHash } from "node:crypto";
import type { AIResponse } from "@/providers/types";
import type { DB } from "../db/database";

/**
 * Cache for live cloud responses, keyed by model + exact prompt + limits.
 * Re-running a Comparison Lab test returns the cached answer at $0 instead of
 * paying twice. Local and simulated responses are never cached.
 */
export class ResponseCache {
  constructor(private readonly db: DB) {}

  static key(parts: { modelId: string; system?: string; prompt: string; maxOutputTokens: number; effort?: string | null }): string {
    return createHash("sha256")
      .update(JSON.stringify([parts.modelId, parts.system ?? "", parts.prompt, parts.maxOutputTokens, parts.effort ?? ""]))
      .digest("hex");
  }

  get(key: string): AIResponse | null {
    const r = this.db.prepare(`SELECT response_json FROM response_cache WHERE key = ?`).get(key) as { response_json: string } | undefined;
    return r ? (JSON.parse(r.response_json) as AIResponse) : null;
  }

  put(key: string, modelId: string, response: AIResponse, costUsd: number): void {
    this.db
      .prepare(`INSERT OR REPLACE INTO response_cache (key, model_id, created_at, response_json, cost_usd) VALUES (?, ?, ?, ?, ?)`)
      .run(key, modelId, new Date().toISOString(), JSON.stringify(response), costUsd);
  }

  stats(): { entries: number; costAvoidedPerHitUsd: number } {
    const r = this.db.prepare(`SELECT COUNT(*) n, COALESCE(AVG(cost_usd), 0) c FROM response_cache`).get() as { n: number; c: number };
    return { entries: r.n, costAvoidedPerHitUsd: r.c };
  }
}
