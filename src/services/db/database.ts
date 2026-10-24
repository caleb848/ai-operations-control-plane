import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Minimal database surface the repositories use. Two drivers implement it:
 *   better-sqlite3  local installs: SQLite file, WAL, native addon (loaded lazily)
 *   node:sqlite     portfolio deployments: Node's built-in SQLite, in memory, no native addon
 */
export interface DbStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface DB {
  readonly driver: "better-sqlite3" | "node:sqlite";
  prepare(sql: string): DbStatement;
  exec(sql: string): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL,
  scenario_id TEXT,
  session_id TEXT,
  status TEXT NOT NULL,
  mode TEXT,
  location TEXT,
  task_type TEXT NOT NULL,
  complexity TEXT NOT NULL,
  classification TEXT NOT NULL,
  business_risk TEXT NOT NULL,
  priority_mode TEXT NOT NULL,
  selected_model_id TEXT,
  selected_model_name TEXT,
  executed_model_id TEXT,
  executed_model_name TEXT,
  executed_provider TEXT,
  fallback_used INTEGER NOT NULL DEFAULT 0,
  budget_guard INTEGER NOT NULL DEFAULT 0,
  policy_blocks INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  token_source TEXT,
  external_cost_usd REAL NOT NULL DEFAULT 0,
  simulated_cost_usd REAL NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  baseline_cost_usd REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  latency_source TEXT,
  output_tps REAL,
  prefill_tps REAL,
  load_ms INTEGER,
  eval_score INTEGER,
  review_required INTEGER NOT NULL DEFAULT 0,
  review_status TEXT NOT NULL DEFAULT 'not_required',
  title TEXT NOT NULL,
  input_preview TEXT NOT NULL,
  input_sha256 TEXT NOT NULL,
  output_text TEXT,
  error TEXT,
  decision_json TEXT NOT NULL,
  evaluation_json TEXT,
  review_json TEXT,
  attempts_json TEXT NOT NULL DEFAULT '[]',
  trace_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exec_created ON executions(created_at);
CREATE INDEX IF NOT EXISTS idx_exec_review ON executions(review_status);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL UNIQUE REFERENCES executions(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,
  reasons_json TEXT NOT NULL,
  decided_at TEXT,
  reviewer TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS budget_sessions (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  budget_usd REAL NOT NULL,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  session_id TEXT NOT NULL,
  execution_id TEXT,
  model_id TEXT,
  kind TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS response_cache (
  key TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  response_json TEXT NOT NULL,
  cost_usd REAL NOT NULL
);
`;

interface RawStatement {
  run(...p: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...p: unknown[]): unknown;
  all(...p: unknown[]): unknown[];
}
interface RawDatabase {
  prepare(sql: string): RawStatement;
  exec(sql: string): void;
}

const runResult = (r: { changes: number | bigint; lastInsertRowid: number | bigint }) => ({
  changes: Number(r.changes),
  lastInsertRowid: Number(r.lastInsertRowid),
});

/** Local SQLite file (or :memory: in tests) through better-sqlite3. Required lazily so portfolio builds never load the native addon. */
function openBetterSqlite(file: string): DB {
  const Database = createRequire(import.meta.url)("better-sqlite3") as new (f: string) => RawDatabase & { pragma(s: string): unknown };
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  if (file !== ":memory:") db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return {
    driver: "better-sqlite3",
    exec: (sql) => db.exec(sql),
    prepare: (sql) => {
      const st = db.prepare(sql);
      return { run: (...p) => runResult(st.run(...p)), get: (...p) => st.get(...p), all: (...p) => st.all(...p) };
    },
  };
}

/** SQLite values node:sqlite accepts: no booleans or undefined. */
function toSql(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

/**
 * In-memory SQLite through Node's built-in node:sqlite. Unlike better-sqlite3 it
 * rejects named parameters the statement doesn't use, so objects are filtered
 * to the @names that appear in the SQL.
 */
function openNodeSqliteMemory(): DB {
  const mod = process.getBuiltinModule("node:sqlite") as { DatabaseSync: new (f: string) => RawDatabase } | undefined;
  if (!mod) throw new Error("node:sqlite is unavailable; portfolio mode requires Node.js 22.13+.");
  const db = new mod.DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const bind = (names: Set<string>, params: unknown[]): unknown[] => {
    if (params.length === 1 && params[0] !== null && typeof params[0] === "object" && !Array.isArray(params[0]) && !(params[0] instanceof Uint8Array)) {
      const src = params[0] as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const n of names) out[n] = toSql(src[n]);
      return [out];
    }
    return params.map(toSql);
  };
  return {
    driver: "node:sqlite",
    exec: (sql) => db.exec(sql),
    prepare: (sql) => {
      const st = db.prepare(sql);
      const names = new Set([...sql.matchAll(/@([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
      return {
        run: (...p) => runResult(st.run(...bind(names, p))),
        get: (...p) => st.get(...bind(names, p)),
        all: (...p) => st.all(...bind(names, p)),
      };
    },
  };
}

export type DatabaseTarget = { kind: "file"; path: string } | { kind: "memory"; driver?: "better-sqlite3" | "node:sqlite" };

export function openDatabase(target: DatabaseTarget | ":memory:"): DB {
  const t: DatabaseTarget = target === ":memory:" ? { kind: "memory", driver: "better-sqlite3" } : target;
  const db = t.kind === "file" ? openBetterSqlite(t.path) : t.driver === "node:sqlite" ? openNodeSqliteMemory() : openBetterSqlite(":memory:");
  db.exec(SCHEMA);
  return db;
}
