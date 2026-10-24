import { DEFAULT_POLICY, validatePolicy } from "@/core/governance/policy";
import type { CapabilityProfile, GovernancePolicy } from "@/core/types";
import type { DB } from "../db/database";

export interface ModelOverride {
  enabled?: boolean;
  capabilities?: Partial<CapabilityProfile>;
}

/** Operator-editable configuration persisted in SQLite: governance policy and model registry overrides. */
export class SettingsStore {
  constructor(private readonly db: DB) {}

  private read<T>(key: string): T | null {
    const r = this.db.prepare(`SELECT value_json FROM settings WHERE key = ?`).get(key) as { value_json: string } | undefined;
    return r ? (JSON.parse(r.value_json) as T) : null;
  }

  private write(key: string, value: unknown): void {
    this.db
      .prepare(`INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`)
      .run(key, JSON.stringify(value), new Date().toISOString());
  }

  policy(): GovernancePolicy {
    return this.read<GovernancePolicy>("policy") ?? DEFAULT_POLICY;
  }

  savePolicy(p: GovernancePolicy): string[] {
    const errors = validatePolicy(p);
    if (errors.length) return errors;
    this.write("policy", { ...p, version: (this.policy().version ?? 1) + 1 });
    return [];
  }

  /** Restores the defaults as a new version, so decision snapshots never share a version number. */
  resetPolicy(): void {
    this.write("policy", { ...DEFAULT_POLICY, version: (this.policy().version ?? 1) + 1 });
  }

  modelOverrides(): Record<string, ModelOverride> {
    return this.read<Record<string, ModelOverride>>("model_overrides") ?? {};
  }

  saveModelOverride(modelId: string, patch: ModelOverride): void {
    const all = this.modelOverrides();
    const merged: ModelOverride = { ...all[modelId], ...patch, capabilities: { ...all[modelId]?.capabilities, ...patch.capabilities } };
    for (const [k, v] of Object.entries(merged.capabilities ?? {})) {
      if (typeof v !== "number" || v < 0 || v > 100) throw new Error(`Capability ${k} must be between 0 and 100`);
    }
    all[modelId] = merged;
    this.write("model_overrides", all);
  }

  resetModelOverride(modelId: string): void {
    const all = this.modelOverrides();
    delete all[modelId];
    this.write("model_overrides", all);
  }
}
