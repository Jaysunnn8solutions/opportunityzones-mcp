import { PGlite } from "@electric-sql/pglite";
import { postgresConfig, type PostgresClient, type PostgresPool } from "@/lib/access/postgres";
import type { Row } from "@/lib/access/database";

/** Real PostgreSQL SQL/constraints in WASM. No sockets, credentials, or cloud calls. */
export function localPostgresPool(): PostgresPool {
  const parsers = postgresConfig("postgresql://test@localhost/test").types;
  const engine = new PGlite({ parsers: { 20: parsers.getTypeParser(20), 1700: parsers.getTypeParser(1700) } });
  let tail = Promise.resolve();
  async function query(sql: string, values?: unknown[]) {
    if (!values?.length && sql.includes(";")) {
      const results = await engine.exec(sql);
      const last = results.at(-1);
      return { rows: (last?.rows ?? []) as Row[], rowCount: last?.affectedRows ?? 0 };
    }
    const result = await engine.query<Row>(sql, values);
    return { rows: result.rows, rowCount: result.affectedRows || result.rows.length };
  }
  async function connect(): Promise<PostgresClient> {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    return { query, release };
  }
  return {
    connect,
    async query(sql, values) {
      const client = await connect();
      try { return await client.query(sql, values); } finally { client.release(); }
    },
    async end() { await tail; await engine.close(); },
  };
}
