import { createHash } from "node:crypto";
import recorded from "./recorded-outputs.json";

/**
 * Real local-model outputs recorded on the developer's machine
 * (exported by scripts/export-recorded-outputs.ts). The demo replays them for
 * the exact prompt and model they were produced with, labeled as recorded;
 * any other input gets an explicit "simulated" notice instead.
 */
export interface RecordedOutput {
  model: string;
  modelName: string;
  recordedAt: string;
  latencyMs: number;
  outputTokens: number;
  outputTps: number | null;
  machine: string;
  text: string;
}

const TABLE = recorded as Record<string, RecordedOutput>;

export function promptFingerprint(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex");
}

export function findRecordedOutput(prompt: string, providerModelId: string): RecordedOutput | null {
  return TABLE[`${promptFingerprint(prompt)}:${providerModelId}`] ?? null;
}

export const RECORDED_COUNT = Object.keys(TABLE).length;
