import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { sqliteStore, type Store } from "./database";
import { postgresStore } from "./postgres";
import { ACCOUNT_SCHEMA } from "./accountSchema";
import { OPERATIONS_SCHEMA } from "./operationsSchema";

export const DAY = 86_400_000;
export class AccessError extends Error {
  constructor(message: string, readonly status = 429, readonly retryAfter = 60) { super(message); }
}
let connection: Store | undefined;
export function assertStorageConfiguration() {
  if (process.env.DATABASE_URL) return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.VERCEL === "1") throw new AccessError("This deployment requires a supported persistent database. Local SQLite storage is not supported on Vercel.", 503);
  if (!process.env.OZ_STORAGE_PATH || process.env.OZ_SINGLE_HOST !== "1") throw new AccessError("Terms verification and research services need persistent storage on a confirmed single host.", 503);
}
export function db() {
  assertStorageConfiguration();
  if (connection) return connection;
  if (process.env.DATABASE_URL) { connection = postgresStore(process.env.DATABASE_URL); return connection; }
  // Operator-owned runtime storage is provisioned separately, never bundled into a deployment.
  const location = resolve(/* turbopackIgnore: true */ process.env.OZ_STORAGE_PATH ?? ".runtime/access.sqlite");
  mkdirSync(dirname(location), { recursive: true, mode: 0o700 });
  connection = openStore(location);
  return connection;
}
export function openStore(location: string) {
  const store = new DatabaseSync(location);
  store.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, terms TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, public_key BLOB NOT NULL, counter INTEGER NOT NULL, transports TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, expires INTEGER NOT NULL, verified INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS challenges (hash TEXT PRIMARY KEY, kind TEXT NOT NULL, challenge TEXT NOT NULL, account TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS recovery (hash TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS usage (id INTEGER PRIMARY KEY, subject TEXT NOT NULL, action TEXT NOT NULL, at INTEGER NOT NULL, amount INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS usage_lookup ON usage(subject,action,at);
    CREATE INDEX IF NOT EXISTS usage_expiry ON usage(at);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS exports (id TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, fingerprint TEXT NOT NULL, at INTEGER NOT NULL, filename TEXT NOT NULL, mime TEXT NOT NULL, body BLOB, rows INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS export_owner ON exports(account,at);
    CREATE TABLE IF NOT EXISTS consent_documents (digest TEXT PRIMARY KEY, version TEXT NOT NULL, document TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS consents (hash TEXT PRIMARY KEY, version TEXT NOT NULL, digest TEXT NOT NULL REFERENCES consent_documents(digest), channel TEXT NOT NULL CHECK(channel IN ('web','mcp')), accepted INTEGER NOT NULL, expires INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS consent_retention ON consents(accepted);
  `);
  // Additive migration: existing anonymous MCP receipts remain unlinked and
  // cannot authenticate once account-owned connections are required.
  const consentColumns = store.prepare("PRAGMA table_info(consents)").all() as Array<{ name: string }>;
  if (!consentColumns.some((column) => column.name === "account")) store.exec("ALTER TABLE consents ADD COLUMN account TEXT REFERENCES accounts(id) ON DELETE CASCADE");
  if (!consentColumns.some((column) => column.name === "connection_id")) store.exec("ALTER TABLE consents ADD COLUMN connection_id TEXT");
  store.exec(`CREATE TABLE IF NOT EXISTS mcp_connections (
    id TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    label TEXT NOT NULL, consent_hash TEXT NOT NULL UNIQUE REFERENCES consents(hash) ON DELETE CASCADE,
    created INTEGER NOT NULL, last_used INTEGER
  ); CREATE INDEX IF NOT EXISTS mcp_connection_owner ON mcp_connections(account);`);
  store.exec(`CREATE TABLE IF NOT EXISTS mcp_leases (id TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS mcp_events (subject TEXT NOT NULL, code TEXT NOT NULL, bucket INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(subject,code,bucket));
    CREATE TABLE IF NOT EXISTS mcp_cooldowns (subject TEXT PRIMARY KEY, until INTEGER NOT NULL, level INTEGER NOT NULL);`);
  store.exec(`CREATE TABLE IF NOT EXISTS oauth_clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, redirects TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_codes (hash TEXT PRIMARY KEY, client TEXT NOT NULL REFERENCES oauth_clients(id), account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, redirect TEXT NOT NULL, challenge TEXT NOT NULL, resource TEXT NOT NULL, accepted INTEGER NOT NULL, version TEXT NOT NULL, digest TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_access (hash TEXT PRIMARY KEY REFERENCES consents(hash) ON DELETE CASCADE, client TEXT NOT NULL REFERENCES oauth_clients(id), resource TEXT NOT NULL, scope TEXT NOT NULL);`);
  store.exec(`CREATE TRIGGER IF NOT EXISTS account_mcp_cleanup AFTER DELETE ON accounts BEGIN DELETE FROM mcp_events WHERE subject=OLD.id; DELETE FROM mcp_cooldowns WHERE subject=OLD.id; END;`);
  store.exec(ACCOUNT_SCHEMA);
  store.exec(OPERATIONS_SCHEMA);
  return sqliteStore(store);
}
export function transaction<T>(store: Store, run: () => T | Promise<T>): Promise<T> {
  return store.transaction(run);
}
export interface Budget { subject: string; action: string; amount?: number; limit: number; window: number }
/** Must run inside a transaction when combined with another reservation. No queries or addresses retained. */
export async function checkBudgets(store: Store, budgets: Budget[], now = Date.now()) {
  for (const b of budgets) {
    const entries = (await store.prepare("SELECT at, amount FROM usage WHERE subject=? AND action=? AND at>? ORDER BY at").all(b.subject, b.action, now - b.window)) as Array<{ at: number; amount: number }>;
    let total = entries.reduce((sum, e) => sum + e.amount, 0) + (b.amount ?? 1);
    if (total > b.limit) {
      let until = now + b.window;
      for (const e of entries) { total -= e.amount; until = e.at + b.window; if (total <= b.limit) break; }
      throw new AccessError("This service allowance has been reached. Your research selections are preserved. Try again after the allowance resets.", 429, Math.max(1, Math.ceil((until - now) / 1000)));
    }
  }
}
export async function recordBudgets(store: Store, budgets: Budget[], now = Date.now()) {
  // Multiple rolling windows for one action share one event.
  const seen = new Set<string>();
  for (const b of budgets) { const key = `${b.subject}:${b.action}`; if (!seen.has(key)) { (await store.prepare("INSERT INTO usage(subject,action,at,amount) VALUES(?,?,?,?)").run(b.subject, b.action, now, b.amount ?? 1)); seen.add(key); } }
}
export async function consume(budgets: Budget[], store = db(), now = Date.now()) {
  return (await transaction(store, async () => { (await prune(store, now)); (await checkBudgets(store, budgets, now)); (await recordBudgets(store, budgets, now)); }));
}
export async function prune(store: Store, now = Date.now()) {
  const last = Number(((await store.prepare("SELECT value FROM settings WHERE key='last-prune'").get()) as { value: string } | undefined)?.value ?? 0);
  if (last <= now && now - last < 60_000) return;
  (await store.prepare("INSERT INTO settings(key,value) VALUES('last-prune',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(now)));
  (await store.prepare("DELETE FROM usage WHERE at<?").run(now - 35 * DAY));
  (await store.prepare("DELETE FROM usage WHERE action IN ('read','read:public','mcp-read','auth','auth:public','download','download:public') AND at<?").run(now - 3_600_000));
  (await store.prepare("DELETE FROM usage WHERE subject LIKE 'network:%' AND at<?").run(now - 2 * DAY));
  (await store.prepare("DELETE FROM usage WHERE subject LIKE 'browser:%' AND at<=?").run(now - 30 * DAY));
  await store.prepare("DELETE FROM account_allowances WHERE expires<=?").run(now);
  await store.prepare("DELETE FROM security_events WHERE at<?").run(now - 30 * DAY);
  await store.prepare("DELETE FROM operator_audit WHERE at<?").run(now - 90 * DAY);
  (await store.prepare("DELETE FROM sessions WHERE expires<?").run(now));
  (await store.prepare("DELETE FROM challenges WHERE expires<?").run(now));
  (await store.prepare("DELETE FROM exports WHERE at<?").run(now - 3_600_000));
  (await store.prepare("DELETE FROM consents WHERE accepted<?").run(now - 90 * DAY));
  (await store.prepare("DELETE FROM mcp_leases WHERE expires<=?").run(now));
  (await store.prepare("DELETE FROM mcp_events WHERE bucket<?").run(now - 2 * DAY));
  (await store.prepare("DELETE FROM mcp_cooldowns WHERE until<?").run(now - DAY));
  (await store.prepare("DELETE FROM oauth_codes WHERE expires<=?").run(now));
  (await store.prepare("DELETE FROM oauth_clients WHERE created<? AND id NOT IN (SELECT client FROM oauth_codes UNION SELECT client FROM oauth_access)").run(now - 30 * DAY));
}
