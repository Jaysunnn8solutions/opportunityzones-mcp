import { AsyncLocalStorage } from "node:async_hooks";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";

export type Parameters = Array<string | number | bigint | Uint8Array | null>;
export type Row = Record<string, unknown>;
export interface Statement {
  get(...values: Parameters): Promise<Row | undefined>;
  all(...values: Parameters): Promise<Row[]>;
  run(...values: Parameters): Promise<{ changes: number }>;
}
export interface Store {
  prepare(sql: string): Statement;
  exec(sql: string): Promise<void>;
  transaction<T>(run: () => T | Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Serialize local access while an asynchronous transaction owns SQLite's connection. */
export function sqliteStore(database: DatabaseSync): Store {
  const context = new AsyncLocalStorage<boolean>();
  let tail: Promise<unknown> = Promise.resolve();
  function exclusive<T>(run: () => T | Promise<T>): Promise<T> {
    if (context.getStore()) return Promise.resolve().then(run);
    const task = tail.then(() => context.run(true, run));
    tail = task.catch(() => {});
    return task;
  }
  return {
    prepare(sql) {
      return {
        get: (...values) => exclusive(() => database.prepare(sql).get(...values as SQLInputValue[])),
        all: (...values) => exclusive(() => database.prepare(sql).all(...values as SQLInputValue[])),
        run: (...values) => exclusive(() => ({ changes: Number(database.prepare(sql).run(...values as SQLInputValue[]).changes) })),
      };
    },
    exec: (sql) => exclusive(() => database.exec(sql)),
    transaction: (run) => exclusive(async () => {
      database.exec("BEGIN IMMEDIATE");
      try { const result = await run(); database.exec("COMMIT"); return result; }
      catch (error) { database.exec("ROLLBACK"); throw error; }
    }),
    close: () => exclusive(() => database.close()),
  };
}
