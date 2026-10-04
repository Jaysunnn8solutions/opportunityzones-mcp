import { describe, expect, it } from "vitest";
import { createPostgresStore, postgresConfig, postgresSql } from "./postgres";
import { consume, DAY } from "./store";
import { localPostgresPool } from "@/tests/postgres-driver";

describe("PostgreSQL storage", () => {
  it("verifies TLS, bounds connections, and never reflects malformed credentials", () => {
    const config = postgresConfig("postgresql://test@db.example/app?sslmode=disable&sslrootcert=unsafe&uselibpqcompat=true");
    expect(config.ssl.rejectUnauthorized).toBe(true);
    expect(config.enableChannelBinding).toBe(true);
    expect(config.max).toBe(3);
    expect(config.connectionString).not.toContain("sslmode");
    expect(config.connectionString).not.toContain("sslrootcert");
    expect(() => postgresConfig("not-a-url-private-value")).toThrow("Invalid database configuration.");
    expect(config.types.getTypeParser(1700)("10")).toBe(10);
    expect(() => config.types.getTypeParser(20)("9007199254740993")).toThrow(/supported range/);
  });
  it("binds placeholders without rewriting question marks inside literals", () => {
    expect(postgresSql("SELECT '?' AS label, ? AS value, 'it''s?' AS other")).toBe("SELECT '?' AS label, $1 AS value, 'it''s?' AS other");
    expect(postgresSql("INSERT OR IGNORE INTO settings VALUES(?,?)")).toBe("INSERT INTO settings VALUES($1,$2) ON CONFLICT DO NOTHING");
  });
  it("adds account-management metadata to a version-one database without changing existing accounts", async () => {
    const pool = localPostgresPool(), first = createPostgresStore(pool);
    try {
      await first.prepare("INSERT INTO accounts VALUES('legacy','prior-terms',1)").run();
      await first.exec("DROP TABLE credential_details; DROP TABLE session_details; DROP TABLE account_acceptances; DELETE FROM oz_schema_migrations WHERE version=2;");
      const upgraded = createPostgresStore(pool);
      expect(await upgraded.prepare("SELECT * FROM accounts WHERE id='legacy'").get()).toEqual({ id: "legacy", terms: "prior-terms", created: 1 });
      expect(await upgraded.prepare("SELECT * FROM account_acceptances").all()).toEqual([]);
      expect(await upgraded.prepare("SELECT version FROM oz_schema_migrations ORDER BY version").all()).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }]);
    } finally { await pool.end(); }
  }, 30_000);
  it("migrates once, shares quotas across adapters, and rolls back failed reservations", async () => {
    const pool = localPostgresPool();
    const first = createPostgresStore(pool), second = createPostgresStore(pool);
    try {
      const budgets = [{ subject: "concurrent-test", action: "exports", limit: 1, window: DAY }];
      const results = await Promise.allSettled([consume(budgets, first), consume(budgets, second)]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(rejected.reason.message).toMatch(/allowance/);
      expect(await first.prepare("SELECT * FROM oz_schema_migrations").all()).toHaveLength(3);
      await expect(second.transaction(async () => {
        await second.prepare("INSERT INTO settings VALUES('rollback-test','secret')").run();
        throw new Error("abort");
      })).rejects.toThrow("abort");
      expect(await first.prepare("SELECT * FROM settings WHERE key='rollback-test'").get()).toBeUndefined();
      expect(await second.prepare("SELECT SUM(amount) AS n FROM usage WHERE subject='concurrent-test'").get()).toEqual({ n: 1 });
      const third = createPostgresStore(pool);
      await expect(consume(budgets, third)).rejects.toThrow(/allowance/);
    } finally { await pool.end(); }
  }, 30_000);
  it("upgrades a version-two database while retaining existing credentials and terms", async () => {
    const pool = localPostgresPool(), first = createPostgresStore(pool);
    try {
      await first.prepare("INSERT INTO accounts VALUES('legacy-two','accepted-terms',123)").run();
      await first.prepare("INSERT INTO credentials VALUES('credential','legacy-two',?,4,'[]')").run(new Uint8Array([1, 2]));
      await first.exec("DROP TABLE account_allowances; DROP TABLE security_events; DROP TABLE operator_audit; DELETE FROM oz_schema_migrations WHERE version=3;");
      const upgraded = createPostgresStore(pool);
      expect(await upgraded.prepare("SELECT terms FROM accounts WHERE id='legacy-two'").get()).toEqual({ terms: "accepted-terms" });
      expect(await upgraded.prepare("SELECT counter FROM credentials WHERE id='credential'").get()).toEqual({ counter: 4 });
      for (const table of ["account_allowances", "security_events", "operator_audit"]) expect(await upgraded.prepare(`SELECT * FROM ${table}`).all()).toEqual([]);
      expect(await upgraded.prepare("SELECT version FROM oz_schema_migrations ORDER BY version").all()).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }]);
    } finally { await pool.end(); }
  }, 30_000);
});
