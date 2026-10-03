import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, types } from "pg";
import type { Parameters, Row, Store } from "./database";
import { POSTGRES_SCHEMA } from "./postgresSchema";

/** Only application-owned SQL reaches this adapter; values remain bound parameters. */
export function postgresSql(sql: string) {
  let index = 0;
  const converted = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, (token) => token === "?" ? `$${++index}` : token);
  if (/^INSERT OR IGNORE /i.test(converted)) return converted.replace(/^INSERT OR IGNORE /i, "INSERT ") + " ON CONFLICT DO NOTHING";
  return converted;
}

export function postgresConfig(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Invalid database configuration."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || url.pathname.length < 2) throw new Error("Invalid database configuration.");
  // Never allow URL parameters to silently downgrade certificate verification.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) url.searchParams.delete(key);
  return {
    connectionString: url.toString(), ssl: { rejectUnauthorized: true }, enableChannelBinding: true,
    max: 3, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 10_000,
    statement_timeout: 15_000, lock_timeout: 5_000, idle_in_transaction_session_timeout: 15_000,
    allowExitOnIdle: true,
    types: { getTypeParser(oid: number, format?: "text" | "binary") {
      if ([20, 1700].includes(oid) && format !== "binary") return (value: string) => {
        const parsed = Number(value);
        if (!Number.isSafeInteger(parsed)) throw new Error("Database integer exceeds the supported range.");
        return parsed;
      };
      return types.getTypeParser(oid, format);
    } },
  };
}

export function postgresStore(raw: string): Store {
  const pool = new Pool(postgresConfig(raw));
  // Idle socket failures must not crash the process or log credentials. A later request reconnects.
  pool.on("error", () => {});
  return createPostgresStore(pool);
}

export interface PostgresClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
  release(): void;
}
export interface PostgresPool {
  query(sql: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
  connect(): Promise<PostgresClient>;
  end(): Promise<void>;
}

/** The narrow driver interface also permits real PostgreSQL tests entirely offline. */
export function createPostgresStore(pool: PostgresPool): Store {
  const context = new AsyncLocalStorage<PostgresClient>();
  let ready: Promise<void> | undefined;
  async function initialize() {
    if (!ready) ready = (async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(186819, 1)");
        await client.query("CREATE TABLE IF NOT EXISTS oz_schema_migrations (version INTEGER PRIMARY KEY, applied BIGINT NOT NULL)");
        const version = await client.query("SELECT version FROM oz_schema_migrations WHERE version=1");
        if (!version.rows.length) {
          await client.query(POSTGRES_SCHEMA);
          await client.query("INSERT INTO oz_schema_migrations VALUES (1, $1)", [Date.now()]);
        }
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
      finally { client.release(); }
    })().catch((error) => { ready = undefined; throw error; });
    await ready;
  }
  async function query(sql: string, values: Parameters = []) {
    await initialize();
    const client = context.getStore() ?? pool;
    return client.query(postgresSql(sql), values.map((value) => value instanceof Uint8Array ? Buffer.from(value) : value));
  }
  return {
    prepare(sql) {
      return {
        get: async (...values) => (await query(sql, values)).rows[0],
        all: async (...values) => (await query(sql, values)).rows,
        run: async (...values) => ({ changes: (await query(sql, values)).rowCount ?? 0 }),
      };
    },
    exec: async (sql) => { await query(sql); },
    async transaction(run) {
      if (context.getStore()) throw new Error("Nested access transactions are not supported.");
      await initialize();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Equivalent to SQLite's BEGIN IMMEDIATE: serialize bounded security reservations
        // across all instances. Network/source requests never run under this lock.
        await client.query("SELECT pg_advisory_xact_lock(186819, 2)");
        const result = await context.run(client, run);
        await client.query("COMMIT");
        return result;
      } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
      finally { client.release(); }
    },
    close: () => pool.end(),
  };
}
