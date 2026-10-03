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
      expect(await first.prepare("SELECT * FROM oz_schema_migrations").all()).toHaveLength(1);
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
});
